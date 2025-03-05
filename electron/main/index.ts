import { app, BrowserWindow, shell, ipcMain, BrowserView, dialog, Menu } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { update } from './update'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { TiddlyWiki } = require("tiddlywiki")

async function buildWiki() {
  try {
    const { boot } = TiddlyWiki()
    boot.argv = [wikiPath, '--build', 'index']
    await boot.boot(() => {
      console.log('开始构建')
    })

    const outputPath = path.join(wikiPath, 'output', 'index.html')
    const result = await dialog.showMessageBox({
      type: 'info',
      title: '构建完成',
      message: `Wiki 已构建完成，是否在浏览器中预览？`,
      buttons: ['预览', '在文件夹中显示', '关闭'],
      defaultId: 0,
      cancelId: 2
    })

    if (result.response === 0) {
      shell.openExternal(`file://${outputPath}`)
    } else if (result.response === 1) {
      shell.showItemInFolder(outputPath)
    }
  } catch (err: any) {
    dialog.showErrorBox("错误", `构建 Wiki 失败：${err.message}`)
  }
}

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let wikiPath = path.join(__dirname, "wiki")
let currentServer: any = null
let mainView: BrowserView | null = null
const DEFAULT_PORT = 8080

async function initWiki(wikiFolder: string) {
  try {
    const bootPath = path.join(wikiFolder, "tiddlywiki.info")

    if (!fs.existsSync(bootPath)) {
      const { boot } = TiddlyWiki()
      boot.argv = [wikiFolder, "--init", 'server']
      await boot.boot(() => {
        console.log('start init first')
      })
      console.log('finished init')
    }

    if (currentServer) {
      currentServer = null
    }

    const { boot: twBoot } = TiddlyWiki()
    twBoot.argv = [
      wikiFolder,
      "--listen",
      `port=${DEFAULT_PORT}`,
    ]

    const startServer = () => {
      console.log(`start begin: http://localhost:${DEFAULT_PORT}`)
      // 修改这里：获取所有 BrowserView 并找到主视图（第二个视图）
      // const views = win?.getBrowserViews()
      // if (views && views.length > 1) {
      //   views[1].webContents.loadURL(`http://localhost:${DEFAULT_PORT}`)
      // }
        mainView!.webContents.loadURL(`http://localhost:${DEFAULT_PORT}`)
    }

    currentServer = twBoot
    twBoot.boot(startServer)
  } catch (err: any) {
    dialog.showErrorBox("错误", `初始化 Wiki 失败：${err.message}`)
  }
}

const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      // preload,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  })
  // 创建侧边栏视图
  // const sidebarView = new BrowserView({
  //   webPreferences: {
  //     preload,
  //     nodeIntegration: false,
  //     contextIsolation: true,
  //   },
  // })

  // 创建主内容视图
  mainView = new BrowserView({
    webPreferences: {
      // preload, // loading
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  })
  // win.addBrowserView(sidebarView)
  win.addBrowserView(mainView)

  // 初始化并加载 wiki
  // TODO: 为什么只能在 addBrowserView 之后才能加载 wiki
  initWiki(wikiPath)

  // 设置视图布局
  const sidebarWidth = 0
  function updateBrowserViewsSize() {
    const bounds = win?.getBounds()
    if (!bounds) return

    // sidebarView.setBounds({
    //   x: 0,
    //   y: 0,
    //   width: sidebarWidth,
    //   height: bounds.height
    // })
    mainView!.setBounds({
      x: sidebarWidth,
      y: 0,
      width: bounds.width - sidebarWidth,
      height: bounds.height
    })
  }

  win.on('resize', updateBrowserViewsSize)
  updateBrowserViewsSize()

  // 加载内容
  if (VITE_DEV_SERVER_URL) {
    // sidebarView.webContents.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // sidebarView.webContents.loadFile(indexHtml)
  }
  // 设置菜单
  const menu = Menu.buildFromTemplate([
    {
      label: "文件",
      submenu: [
        {
          label: "打开 Wiki",
          click: openFolderDialog,
        },
        {
          label: "构建 Wiki",
          click: buildWiki,
        },
        {
          label: "在浏览器中打开",
          click: () => {
            shell.openExternal(`http://localhost:${DEFAULT_PORT}`)
          }
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: '开发',
      submenu: [
        // {
          // label: '打开侧边栏开发工具',
          // click: () => sidebarView.webContents.openDevTools({ mode: 'detach' })
        // },
        {
          label: '打开主视图开发工具',
          click: () => mainView!.webContents.openDevTools({ mode: 'right' })
        }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)

  if (VITE_DEV_SERVER_URL) { // #298
    // win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    // win.webContents.openDevTools()
  } else {
    // win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Auto update
  update(win)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      // preload,
      nodeIntegration: false,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    // childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    // childWindow.loadFile(indexHtml, { hash: arg })
  }
})

function openFolderDialog() {
  dialog
    .showOpenDialog({
      title: "选择 Wiki 文件夹",
      properties: ["openDirectory"],
    })
    .then((result) => {
      if (!result.canceled && result.filePaths.length > 0) {
        wikiPath = result.filePaths[0]
        initWiki(wikiPath)
      }
    })
}

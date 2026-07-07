const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

// Workaround for blank renderer content on this machine: native window chrome and an
// explicit backgroundColor paint fine, but page content never composites even after
// did-finish-load — classic symptom of the renderer's GPU channel failing in a
// VM/remote-desktop session. Falls back to software rendering.
app.commandLine.appendSwitch('disable-gpu-sandbox') // restricted session tokens (SSH/scheduled-task launch) can block the GPU sandbox's handle acquisition

const logPath = path.join(app.getPath('userData'), 'spike.log')
function log(msg) {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
  } catch (e) {
    // ignore
  }
}

function createWindow() {
  const indexPath = path.join(__dirname, 'renderer', 'index.html')
  log(`indexPath=${indexPath} exists=${fs.existsSync(indexPath)}`)

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#ff0000', // diagnostic: if even this doesn't paint, the GPU compositor isn't delivering frames at all
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    log(`did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`)
  })
  win.webContents.on('did-finish-load', () => log('did-finish-load'))
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    log(`console[${level}] ${sourceId}:${line} ${message}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    log(`render-process-gone ${JSON.stringify(details)}`)
  })

  const minimalTestMarker = path.join(app.getPath('userData'), 'MINIMAL_TEST')
  if (fs.existsSync(minimalTestMarker)) {
    win.loadURL('data:text/html,<body style="background:blue"><h1 style="color:white">MINIMAL TEST OK</h1></body>')
  } else {
    win.loadFile(indexPath).catch((e) => log(`loadFile threw: ${e}`))
  }
}

process.on('uncaughtException', (e) => log(`uncaughtException: ${e.stack || e}`))

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

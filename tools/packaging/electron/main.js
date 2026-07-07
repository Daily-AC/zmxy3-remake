const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

// Workaround for blank renderer content on this machine: native window chrome and an
// explicit backgroundColor paint fine, but page content never composites even after
// did-finish-load — classic symptom of the renderer's GPU channel failing in a
// VM/remote-desktop session. Falls back to software rendering.
app.commandLine.appendSwitch('disable-gpu-sandbox') // restricted session tokens (SSH/scheduled-task launch) can block the GPU sandbox's handle acquisition

// Toggle via marker file (no rebuild needed to A/B test): Chromium's Windows presentation
// path defaults to DirectComposition, which is a common friction point against virtual
// display drivers (distinct from the GPU-acceleration-on/off axis already tested).
if (fs.existsSync(path.join(app.getPath('userData'), 'DISABLE_DIRECT_COMPOSITION'))) {
  app.commandLine.appendSwitch('disable-direct-composition')
  app.commandLine.appendSwitch('disable-features', 'DirectComposition')
}

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
  win.webContents.on('did-finish-load', () => {
    log('did-finish-load')
    // Bypasses whatever is broken on the screen-presentation path: capturePage reads the
    // renderer's own frame buffer directly, independent of window compositing/display output.
    setTimeout(() => {
      win.webContents
        .capturePage()
        .then((image) => {
          const buf = image.toPNG()
          const outPath = path.join(app.getPath('userData'), 'captured-frame.png')
          fs.writeFileSync(outPath, buf)
          log(`capturePage saved to ${outPath} size=${buf.length} dims=${JSON.stringify(image.getSize())}`)
        })
        .catch((e) => log(`capturePage error: ${e}`))
    }, 3000)
  })
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
process.on('unhandledRejection', (e) => log(`unhandledRejection: ${e && e.stack ? e.stack : e}`))
app.on('render-process-gone', (_e, _wc, details) => log(`app render-process-gone: ${JSON.stringify(details)}`))
app.on('child-process-gone', (_e, details) => log(`child-process-gone: ${JSON.stringify(details)}`))
app.on('before-quit', () => log('app before-quit'))
process.on('exit', (code) => {
  try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] process exit code=${code}\n`) } catch (e) {}
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

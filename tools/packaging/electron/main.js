const { app, BrowserWindow, screen } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const userDataDir = app.getPath('userData') // documented as safe to call before 'ready'

// Defensive defaults for launching under a restricted/remote session (SSH scheduled-task
// or virtual-display-adapter setups): see docs/research/packaging-spike.md for how these
// were arrived at.
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-direct-composition')
app.commandLine.appendSwitch('disable-features', 'DirectComposition')

// One-shot mitigation for a GPU-process crash (observed exitCode 34 on this host): the
// marker is written right before we relaunch and consumed (deleted) on the next start, so
// only the retry attempt forces software rendering — a later *clean* launch still tries
// hardware acceleration first rather than being permanently downgraded.
const gpuRestartMarker = path.join(userDataDir, 'GPU_CRASH_RESTART')
let startedAfterGpuCrash = false
if (fs.existsSync(gpuRestartMarker)) {
  startedAfterGpuCrash = true
  try {
    fs.unlinkSync(gpuRestartMarker)
  } catch (e) {
    // ignore
  }
  app.disableHardwareAcceleration()
}

const logPath = path.join(userDataDir, 'spike.log')
function log(msg) {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
  } catch (e) {
    // ignore
  }
}

log(`app start, startedAfterGpuCrash=${startedAfterGpuCrash}`)

function createWindow() {
  const indexPath = path.join(__dirname, 'renderer', 'index.html')
  log(`indexPath=${indexPath} exists=${fs.existsSync(indexPath)}`)

  try {
    const d = screen.getPrimaryDisplay()
    log(`primaryDisplay bounds=${JSON.stringify(d.bounds)} workArea=${JSON.stringify(d.workArea)} scaleFactor=${d.scaleFactor}`)
  } catch (e) {
    log(`screen.getPrimaryDisplay threw: ${e}`)
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  log(`win.getBounds() right after construction: ${JSON.stringify(win.getBounds())}`)
  // Ruled out as the cause of the capturePage 0x0 issue (see packaging-spike.md section 7):
  // window bounds are always sane here, even on the launch path where capturePage still
  // comes back empty. Kept anyway as a harmless explicit default.
  win.setBounds({ x: 0, y: 0, width: 1280, height: 800 })
  log(`win.getBounds() after explicit setBounds: ${JSON.stringify(win.getBounds())}`)

  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    log(`did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`)
  })
  win.webContents.on('did-finish-load', () => log('did-finish-load'))
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    log(`console[${level}] ${sourceId}:${line} ${message}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    log(`webContents render-process-gone ${JSON.stringify(details)}`)
  })

  // Acceptance-run capture protocol: tools/acceptance/run-and-capture.ps1 creates
  // CAPTURE_NOW once it has given the scene time to settle; we poll for it rather than
  // using a fixed timer so the caller controls timing. capturePage() reads the renderer's
  // own frame buffer directly, independent of whatever is happening on the window's
  // screen-presentation path — see docs/research/packaging-spike.md section 7.
  const captureTrigger = path.join(userDataDir, 'CAPTURE_NOW')
  const captureOutPath = path.join(userDataDir, 'captured-frame.png')
  const captureResultPath = path.join(userDataDir, 'capture-result.json')
  let capturing = false
  const capturePoll = setInterval(() => {
    if (capturing || win.isDestroyed() || !fs.existsSync(captureTrigger)) return
    capturing = true
    try {
      fs.unlinkSync(captureTrigger)
    } catch (e) {
      // ignore
    }
    win.webContents
      .capturePage()
      .then((image) => {
        const buf = image.toPNG()
        fs.writeFileSync(captureOutPath, buf)
        const result = { ok: true, size: buf.length, dims: image.getSize(), at: new Date().toISOString() }
        fs.writeFileSync(captureResultPath, JSON.stringify(result))
        log(`capturePage saved to ${captureOutPath} size=${buf.length} dims=${JSON.stringify(image.getSize())}`)
      })
      .catch((e) => {
        fs.writeFileSync(captureResultPath, JSON.stringify({ ok: false, error: String(e), at: new Date().toISOString() }))
        log(`capturePage error: ${e}`)
      })
      .finally(() => {
        capturing = false
      })
  }, 500)
  win.on('closed', () => clearInterval(capturePoll))

  win.loadFile(indexPath).catch((e) => log(`loadFile threw: ${e}`))
}

let gpuCrashHandled = false
app.on('child-process-gone', (_e, details) => {
  log(`child-process-gone: ${JSON.stringify(details)}`)
  if (details.type === 'GPU' && !startedAfterGpuCrash && !gpuCrashHandled) {
    gpuCrashHandled = true
    log('GPU crashed — relaunching once with hardware acceleration disabled')
    try {
      fs.writeFileSync(gpuRestartMarker, '1')
    } catch (e) {
      // ignore
    }
    app.relaunch()
    app.exit(0)
  }
})

process.on('uncaughtException', (e) => log(`uncaughtException: ${e.stack || e}`))
process.on('unhandledRejection', (e) => log(`unhandledRejection: ${e && e.stack ? e.stack : e}`))
app.on('before-quit', () => log('app before-quit'))
process.on('exit', (code) => {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] process exit code=${code}\n`)
  } catch (e) {
    // ignore
  }
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

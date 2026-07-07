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

  // Scripted-playthrough protocol: tools/acceptance/run-and-capture.ps1 ships
  // playthrough-script.json into userData and drops RUN_SCRIPT to kick it off. Each step
  // can inject JS into the renderer (the game's own `window.__*` acceptance hooks — see
  // BattleScene.exposeDebugHooks — not raw OS input, since those hooks already exist
  // specifically for this purpose and are far more reliable than simulating keystrokes
  // into a window that may not even be visible/focused in this launch session), wait, and
  // optionally capturePage(). This replaces the old "wait a fixed time then take one boot
  // screenshot" flow with an actual scripted playthrough (menu -> battle -> combat -> NPC
  // craft -> level clear), still using capturePage() as the evidence mechanism per step so
  // it inherits the same screen-presentation-independent guarantee as the single-frame
  // protocol above.
  const runScriptTrigger = path.join(userDataDir, 'RUN_SCRIPT')
  const scriptResultPath = path.join(userDataDir, 'SCRIPT_RESULT.json')
  let scriptRunning = false

  async function captureStep(stepId) {
    const image = await win.webContents.capturePage()
    const buf = image.toPNG()
    const outPath = path.join(userDataDir, `step-${stepId}.png`)
    fs.writeFileSync(outPath, buf)
    return { file: outPath, size: buf.length, dims: image.getSize() }
  }

  async function runStep(step) {
    const record = { id: step.id, ok: true }
    try {
      if (step.repeat) {
        const results = []
        for (let i = 0; i < step.repeat; i++) {
          if (step.js) results.push(await win.webContents.executeJavaScript(step.js))
          await new Promise((r) => setTimeout(r, step.repeatIntervalMs ?? 500))
        }
        record.jsResult = results
      } else if (step.js) {
        record.jsResult = await win.webContents.executeJavaScript(step.js)
      }
      if (step.pollUntil) {
        const deadline = Date.now() + (step.pollTimeoutMs ?? 15000)
        let met = false
        while (Date.now() < deadline) {
          met = await win.webContents.executeJavaScript(step.pollUntil)
          if (met) break
          await new Promise((r) => setTimeout(r, step.pollIntervalMs ?? 1000))
        }
        record.pollMet = met
        if (!met) record.pollTimedOut = true
      }
      if (step.waitMs) await new Promise((r) => setTimeout(r, step.waitMs))
      if (step.capture) record.capture = await captureStep(step.id)
    } catch (e) {
      record.ok = false
      record.error = String(e && e.stack ? e.stack : e)
      log(`script step ${step.id} error: ${record.error}`)
    }
    return record
  }

  async function runScript(scriptPath) {
    scriptRunning = true
    const steps = JSON.parse(fs.readFileSync(scriptPath, 'utf8'))
    const results = []
    for (const step of steps) {
      log(`script step start: ${step.id}`)
      results.push(await runStep(step))
    }
    const ok = results.every((r) => r.ok)
    fs.writeFileSync(scriptResultPath, JSON.stringify({ ok, at: new Date().toISOString(), steps: results }, null, 2))
    log(`script finished ok=${ok}`)
    scriptRunning = false
  }

  const scriptPoll = setInterval(() => {
    if (scriptRunning || win.isDestroyed() || !fs.existsSync(runScriptTrigger)) return
    let scriptPath
    try {
      scriptPath = fs.readFileSync(runScriptTrigger, 'utf8').trim()
      fs.unlinkSync(runScriptTrigger)
    } catch (e) {
      return
    }
    runScript(scriptPath).catch((e) => log(`runScript threw: ${e && e.stack ? e.stack : e}`))
  }, 500)
  win.on('closed', () => clearInterval(scriptPoll))

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

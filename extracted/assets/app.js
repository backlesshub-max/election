/* RCSU Election 2026-2027 | Frontend author: Reinhardson Sangma
 * The browser contains no service-role key and does not access voter/ballot tables directly.
 */
(() => {
  'use strict'
  const CFG = window.RCSU_CONFIG || {}
  const app = document.getElementById('app')
  const toastRegion = document.getElementById('toastRegion')
  const adminShortcut = document.getElementById('adminShortcut')
  const ballotKey = 'rcsu_current_ballot'
  const stepKey = 'rcsu_current_step'
  const ticketKey = 'rcsu_ticket'
  const state = {
    client: null, view: 'login', session: null, adminEmail: '',
    positions: [], candidates: [], settings: {}, dashboard: null,
    voterName: '', ticket: '', selections: {}, step: 0,
    kioskLocked: false, kioskActive: false, busy: false, editCandidate: null, resultSearch: '', resultPosition: 'all'
  }

  const $ = (selector, root = document) => root.querySelector(selector)
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
  const imgUrl = value => {
    if (!value) return ''
    try { return new URL(value, document.baseURI).href } catch { return '' }
  }
  const fmt = value => new Intl.NumberFormat('en-IN').format(Number(value || 0))
  const showToast = (message, type = '') => {
    const node = document.createElement('div')
    node.className = `toast ${type}`
    node.textContent = message
    toastRegion.append(node)
    window.setTimeout(() => node.remove(), 4200)
  }
  const setBusy = busy => {
    state.busy = busy
    app.querySelectorAll('button').forEach(btn => { if (btn.dataset.keepEnabled !== 'true') btn.disabled = busy || btn.disabled })
  }
  const readBallot = () => {
    try { return JSON.parse(localStorage.getItem(ballotKey) || '{}') } catch { return {} }
  }
  const saveBallot = () => {
    // Store selections only: no name, roll number, mobile number or ticket in localStorage.
    localStorage.setItem(ballotKey, JSON.stringify(state.selections))
    localStorage.setItem(stepKey, String(state.step))
  }
  const clearVotingSession = () => {
    state.voterName = ''
    state.ticket = ''
    state.selections = {}
    state.step = 0
    state.kioskLocked = false
    sessionStorage.removeItem(ticketKey)
    localStorage.removeItem(ballotKey)
    localStorage.removeItem(stepKey)
  }
  const getSession = async () => {
    const { data } = await state.client.auth.getSession()
    state.session = data.session
    return state.session
  }
  const api = async (action, fields = {}) => {
    const { data, error } = await state.client.functions.invoke(CFG.EDGE_FUNCTION || 'election-api', {
      body: { action, ...fields }
    })
    if (error) {
      let message = error.message || 'Request failed.'
      try { const body = await error.context.json(); message = body.error || message } catch {}
      throw new Error(message)
    }
    if (data?.error) throw new Error(data.error)
    return data?.data
  }
  const showLoading = text => {
    app.innerHTML = `<section class="loading-screen clay-panel"><div class="loader"></div><p>${esc(text || 'Please wait…')}</p></section>`
  }
  const loginTemplate = () => `
    <section class="admin-login clay-panel">
      <div class="brand-mark">RC</div>
      <div class="eyebrow" style="justify-content:center">CONTROLLED ELECTION STATION</div>
      <h1>Administrator Login</h1>
      <p>Sign in with the authorised Raha College election administrator account.</p>
      <form id="loginForm">
        <div class="field"><label for="adminEmail">ADMIN EMAIL</label><input id="adminEmail" type="email" autocomplete="username" required placeholder="admin@college.edu"></div>
        <div class="field"><label for="adminPassword">PASSWORD</label><input id="adminPassword" type="password" autocomplete="current-password" required placeholder="Enter your admin password"></div>
        <div id="loginMessage"></div>
        <button class="btn btn-primary btn-block" type="submit">SECURE ADMIN SIGN IN</button>
      </form>
      <p class="subtle" style="margin:18px 0 0">Public voter registration is disabled. Only accounts added to the election administrator allow-list can open the dashboard.</p>
    </section>`

  const heroTemplate = () => `
    <section class="hero">
      <span class="eyebrow">A voice for every student</span>
      <h1>Raha College Student Union Election 2026–2027</h1>
      <p>Secure Student Voting Portal. Your participation helps shape the student community. Please verify your eligibility before casting your vote.</p>
    </section>`

  const welcomeTemplate = () => `${heroTemplate()}
    <div class="content-grid">
      <section class="form-panel clay-panel">
        <div class="panel-heading"><div><span class="step-kicker">Voter verification</span><h2>Welcome to the election</h2><p>Enter one detail from the official voter list. A second detail can help resolve duplicate records.</p></div><span class="position-counter">01 / VERIFY</span></div>
        <form id="verifyForm">
          <div class="field"><label for="identifier">NAME / ENROLMENT NUMBER / MOBILE NUMBER</label><input id="identifier" required maxlength="120" autocomplete="off" placeholder="Enter your name, enrolment or mobile number"><span class="hint">Use the spelling or number shown on the college voter list.</span></div>
          <div class="field"><label for="confirmName">FULL NAME (OPTIONAL, FOR CLARIFICATION)</label><input id="confirmName" maxlength="120" autocomplete="off" placeholder="Enter full name if the record is ambiguous"></div>
          <div class="field"><label for="course">COURSE / CLASS (OPTIONAL)</label><input id="course" maxlength="80" autocomplete="off" placeholder="Example: BA 3rd Sem"></div>
          <div id="verifyMessage"></div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">VERIFY &amp; CONTINUE</button></div>
        </form>
        <p class="subtle" style="margin:17px 0 0">The voter list is checked privately. Other students will not see your enrolment or mobile number.</p>
      </section>
      <aside class="side-note">
        <span class="eyebrow">Before you begin</span><h3>One student. One ballot.</h3>
        <p>Please complete the voting process yourself. Review each position carefully before confirming. A submitted ballot cannot be changed.</p>
        <div class="security-points">
          <div class="security-point"><span class="point-icon">✓</span><span>Eligibility is checked against the college voter register.</span></div>
          <div class="security-point"><span class="point-icon">◇</span><span>Only one selection is accepted for each position.</span></div>
          <div class="security-point"><span class="point-icon">▣</span><span>Your identity is not stored with your candidate selections.</span></div>
          <div class="security-point"><span class="point-icon">↻</span><span>The station resets for the next student after submission.</span></div>
        </div>
      </aside>
    </div>`

  const currentPosition = () => state.positions[state.step]
  const currentCandidates = () => state.candidates.filter(c => c.position_key === currentPosition()?.position_key && c.active)
  const progressTemplate = () => {
    const total = state.positions.length
    const done = state.step
    const percent = Math.round((done / Math.max(total, 1)) * 100)
    return `<div class="progress-wrap clay-panel"><div class="progress-copy"><strong>${done} of ${total} positions completed</strong><small>Election ballot progress</small><div class="progress-track" style="margin-top:9px"><div class="progress-fill" style="width:${percent}%"></div></div></div><div class="progress-percent">${percent}%</div></div>`
  }
  const voteTemplate = () => {
    const position = currentPosition()
    const candidates = currentCandidates()
    const selected = state.selections[position?.position_key]
    const cards = candidates.map(c => {
      const chosen = selected === c.id
      return `<button class="candidate-card ${chosen ? 'selected' : ''}" type="button" data-action="select-candidate" data-id="${esc(c.id)}" aria-pressed="${chosen}">
        <img class="candidate-photo" src="${esc(imgUrl(c.photo_url))}" alt="Portrait of ${esc(c.full_name)}" loading="lazy" onerror="this.style.visibility='hidden'">
        <span class="candidate-info"><span class="candidate-label">${esc(position.label)}</span><h3>${esc(c.full_name)}</h3>${c.group_name ? `<p>${esc(c.group_name)}</p>` : '<p>Student Union nominee</p>'}<span class="select-pill"><span class="select-dot">${chosen ? '✓' : ''}</span>${chosen ? 'SELECTED' : 'SELECT THIS CANDIDATE'}</span></span>
      </button>`
    }).join('')
    return `${progressTemplate()}<div class="ballot-head"><div><span class="step-kicker">Position ${state.step + 1}</span><h2>${esc(position?.label || 'Election ballot')}</h2><p>Select one candidate for this position to continue.</p></div><span class="position-counter">${state.step + 1} / ${state.positions.length}</span></div>
      ${candidates.length ? `<div class="candidate-grid">${cards}</div>` : '<div class="status-box status-error">There are no active candidates for this position. Contact the election administrator.</div>'}
      <div class="ballot-actions"><button class="btn btn-light" type="button" data-action="cancel-vote">CANCEL SESSION</button><button class="btn btn-primary" type="button" data-action="next-position" ${selected ? '' : 'disabled'}>${state.step === state.positions.length - 1 ? 'REVIEW BALLOT' : 'NEXT POSITION'} →</button></div>`
  }

  const reviewTemplate = () => {
    const rows = state.positions.map((p, i) => {
      const c = state.candidates.find(item => item.id === state.selections[p.position_key])
      return `<div class="review-row"><div><small>${esc(p.label)}</small><strong class="review-choice">${esc(c?.full_name || 'Selection missing')}</strong></div><button type="button" class="review-edit" data-action="edit-position" data-step="${i}">EDIT</button></div>`
    }).join('')
    return `<section class="clay-panel form-panel"><div class="panel-heading"><div><span class="step-kicker">Final check</span><h2>Review Your Selections</h2><p>Confirm that the correct candidate is selected for every position.</p></div><span class="position-counter">FINAL REVIEW</span></div>
      <div class="review-list">${rows}</div>
      <div class="warning-note">Please review your selections carefully. Once your vote is submitted, it cannot be changed. Your choices are submitted as an anonymous ballot.</div>
      <div class="ballot-actions"><button class="btn btn-light" type="button" data-action="edit-position" data-step="${Math.max(0,state.positions.length-1)}">← EDIT VOTE</button><button class="btn btn-primary" type="button" data-action="confirm-submit">CONFIRM &amp; SUBMIT VOTE</button></div>
    </section>`
  }

  const successTemplate = () => `<section class="success-panel clay-panel"><div class="success-symbol">✓</div><span class="eyebrow" style="justify-content:center">Submission complete</span><h1>YOUR VOTE HAS BEEN RECORDED</h1><p>Thank you for participating in the Raha College Student Union Election 2026–2027. Your participation matters. This station is now ready for the next student.</p><button class="btn btn-primary" type="button" data-action="finish">FINISH &amp; RESET STATION</button></section>`

  const statsTemplate = d => `
    <div class="stat-grid">
      <div class="stat-card"><span>Total Registered Voters</span><strong>${fmt(d?.total_voters)}</strong><em>Imported voter records</em></div>
      <div class="stat-card"><span>Eligible Voters</span><strong>${fmt(d?.eligible_voters)}</strong><em>Marked eligible</em></div>
      <div class="stat-card"><span>Total Votes Cast</span><strong>${fmt(d?.votes_cast)}</strong><em>Completed ballots</em></div>
      <div class="stat-card"><span>Remaining Voters</span><strong>${fmt(d?.remaining_voters)}</strong><em>Eligible but not voted</em></div>
      <div class="stat-card"><span>Participation</span><strong>${Number(d?.participation || 0).toFixed(1)}%</strong><em>Based on eligible voters</em></div>
    </div>`

  const resultsTemplate = (d, search = '', position = 'all') => {
    const filtered = (d?.results || []).filter(row => (position === 'all' || row.position_key === position) && row.candidate.toLowerCase().includes(search.toLowerCase()))
    const groups = filtered.reduce((acc, row) => { (acc[row.position_key] ||= {label:row.position, rows:[]}).rows.push(row); return acc }, {})
    const body = Object.values(groups).map(group => {
      const max = Math.max(...group.rows.map(r => Number(r.votes || 0)))
      return `<div class="result-group"><div class="section-title"><div><h2>${esc(group.label)}</h2><p>${d.results_released ? 'Authorised results — winner indicator enabled' : 'Confidential administrator tally — not released'}</p></div></div>
        ${group.rows.map(r => `<div class="candidate-admin-row"><img src="${esc(imgUrl(r.photo_url))}" alt="" onerror="this.style.visibility='hidden'"><div style="flex:1"><strong>${esc(r.candidate)} ${d.results_released && Number(r.votes)===max && max>0 ? '<span class="position-counter">WINNER</span>' : ''}</strong><small>${fmt(r.votes)} votes · ${Number(r.percentage || 0).toFixed(2)}%</small><div class="progress-track" style="margin-top:8px"><div class="progress-fill" style="width:${Math.max(0,Math.min(100,Number(r.percentage || 0)))}%"></div></div></div></div>`).join('')}
      </div>`
    }).join('')
    return body || '<p class="subtle">No candidates have been configured yet.</p>'
  }

  const candidateAdminTemplate = () => state.positions.map(p => {
    const candidates = state.candidates.filter(c => c.position_key === p.position_key)
    return `<div class="admin-section clay-panel"><div class="section-title"><div><h2>${esc(p.label)}</h2><p>${candidates.length} candidate record(s)</p></div><button class="btn btn-light" type="button" data-action="add-candidate" data-position="${esc(p.position_key)}">+ ADD</button></div>
      ${candidates.map(c => `<div class="candidate-admin-row"><img src="${esc(imgUrl(c.photo_url))}" alt="" onerror="this.style.visibility='hidden'"><div><strong>${esc(c.full_name)}</strong><small>${c.active ? 'Active on ballot' : 'Inactive'}${c.group_name ? ' · '+esc(c.group_name) : ''}</small></div><div class="row-tools"><button class="mini-btn" type="button" data-action="edit-candidate" data-id="${esc(c.id)}">EDIT</button><button class="mini-btn" type="button" data-action="toggle-candidate" data-id="${esc(c.id)}">${c.active?'DISABLE':'ENABLE'}</button></div></div>`).join('')}
    </div>`
  }).join('')

  const adminTemplate = () => {
    const d = state.dashboard || {}
    const settings = state.settings || {}
    return `<div class="admin-head"><div><span class="eyebrow">Election control centre</span><h1>Admin Dashboard</h1><p>Signed in as ${esc(state.adminEmail)}</p></div><div class="admin-actions"><button class="btn btn-light" type="button" data-action="refresh-admin">↻ REFRESH</button><button class="btn btn-dark" type="button" data-action="start-kiosk">OPEN VOTING KIOSK</button><button class="btn btn-light" type="button" data-action="logout">LOG OUT</button></div></div>
      ${statsTemplate(d)}
      <section class="admin-section clay-panel"><div class="section-title"><div><h2>Election Controls</h2><p>Changes apply immediately to the voting station.</p></div><span class="position-counter">${settings.voting_open ? 'VOTING OPEN' : 'VOTING PAUSED'}</span></div>
        <div class="toggle-row"><div><strong>Accept voter sessions</strong><small>Pause voting during an interruption or at closing time.</small></div><input id="votingToggle" class="switch" type="checkbox" ${settings.voting_open ? 'checked' : ''}></div>
        <div class="toggle-row"><div><strong>Authorise results release</strong><small>Enables the winner indicator in the administrator results view.</small></div><input id="resultsToggle" class="switch" type="checkbox" ${settings.results_released ? 'checked' : ''}></div>
        <div class="form-actions" style="margin-top:14px"><button class="btn btn-primary" type="button" data-action="save-settings">SAVE ELECTION SETTINGS</button></div>
      </section>
      <section class="admin-section clay-panel"><div class="section-title"><div><h2>Voting Results</h2><p>Aggregated candidate counts only. Individual ballot choices are never displayed.</p></div><div class="admin-actions"><button class="btn btn-light" type="button" data-action="export-results">EXPORT CSV</button><button class="btn btn-light" type="button" data-action="print-results">PRINT</button></div></div>
        <div class="content-grid" style="grid-template-columns:1fr 220px;gap:10px;margin:0 0 14px"><div class="field" style="margin:0"><label for="candidateSearch">SEARCH CANDIDATE</label><input id="candidateSearch" placeholder="Search by candidate name" value="${esc(state.resultSearch)}"></div><div class="field" style="margin:0"><label for="positionFilter">FILTER POSITION</label><select id="positionFilter"><option value="all">All positions</option>${state.positions.map(p=>`<option value="${esc(p.position_key)}" ${state.resultPosition===p.position_key?'selected':''}>${esc(p.label)}</option>`).join('')}</select></div></div><div id="resultsPanel">${resultsTemplate(d,state.resultSearch,state.resultPosition)}</div>
      </section>
      <div class="content-grid" style="grid-template-columns:1fr 1fr">
        <section class="admin-section clay-panel"><div class="section-title"><div><h2>Manage Candidates</h2><p>Edit names, photos, positions and active status.</p></div></div><div class="admin-actions"><button class="btn btn-dark" type="button" data-action="open-candidates">MANAGE CANDIDATES</button></div></section>
        <section class="admin-section clay-panel"><div class="section-title"><div><h2>Voter Register</h2><p>Import the official Excel voter list privately.</p></div></div><div class="admin-actions"><button class="btn btn-dark" type="button" data-action="open-import">IMPORT VOTERS</button></div></section>
      </div>
      <section class="admin-section clay-panel"><div class="section-title"><div><h2>Administrator Report</h2><p>Sends aggregated data to rahacollegenss@gmail.com. No voter identities or individual selections are included.</p></div></div><div class="admin-actions"><button class="btn btn-gold" type="button" data-action="send-report">SEND VOTING DATA TO ADMIN</button><button class="btn btn-danger" type="button" data-action="reset-election">RESET ELECTION</button></div></section>
      <div id="adminSubpanel"></div>`
  }

  const render = () => {
    adminShortcut.classList.toggle('hidden', state.kioskLocked || state.kioskActive)
    if (state.view === 'config') {
      app.innerHTML = `<section class="admin-login clay-panel"><div class="brand-mark">RC</div><span class="eyebrow" style="justify-content:center">Setup required</span><h1>Connect Supabase</h1><p>Set the project URL and publishable key in <code>config.js</code>, then deploy the database migration and Edge Function. No private key belongs in the browser.</p><div class="status-box status-info">The repository is scaffolded, but Supabase is not configured yet.</div></section>`
    } else if (state.view === 'login') app.innerHTML = loginTemplate()
    else if (state.view === 'welcome') app.innerHTML = welcomeTemplate()
    else if (state.view === 'vote') app.innerHTML = voteTemplate()
    else if (state.view === 'review') app.innerHTML = reviewTemplate()
    else if (state.view === 'success') app.innerHTML = successTemplate()
    else if (state.view === 'admin') app.innerHTML = adminTemplate()
    else if (state.view === 'candidates') app.innerHTML = `<div class="admin-head"><div><span class="eyebrow">Administrator tools</span><h1>Candidate Management</h1><p>Changes will appear on the ballot after refresh.</p></div><button class="btn btn-light" data-action="back-admin">← DASHBOARD</button></div>${candidateAdminTemplate()}`
    else if (state.view === 'import') app.innerHTML = `<div class="admin-head"><div><span class="eyebrow">Private voter data import</span><h1>Import Voter Register</h1><p>Upload the college's .xlsx file. Records are sent securely in batches to the private database.</p></div><button class="btn btn-light" data-action="back-admin">← DASHBOARD</button></div><section class="admin-section clay-panel"><div class="file-drop"><strong>Select the official voter workbook (.xlsx)</strong><p>Expected columns: SL No., Name, Course / Class, Enrollment No., Mobile No.</p><input type="file" id="voterFile" accept=".xlsx,.xls"></div><div id="importPreview" class="subtle" style="margin-top:17px"></div><div class="form-actions"><button class="btn btn-primary" type="button" data-action="run-import" id="runImport" disabled>IMPORT VOTERS SECURELY</button></div><p class="subtle">Records without enrolment/mobile values are retained. Duplicate lookups are flagged during verification; the import does not silently discard rows.</p></section>`
  }

  const loadAdminData = async () => {
    showLoading('Loading election control centre…')
    const [boot, dashboard] = await Promise.all([api('bootstrap'), api('dashboard')])
    state.settings = boot.settings || {}
    state.positions = boot.positions || []
    state.candidates = boot.candidates || []
    state.dashboard = dashboard || {}
    state.view = 'admin'
    render()
  }

  const startKiosk = async () => {
    const boot = await api('bootstrap')
    state.settings = boot.settings || {}
    state.positions = boot.positions || []
    state.candidates = boot.candidates || []
    if (!state.positions.length) throw new Error('No active election positions have been configured.')
    if (state.settings.voting_open !== true) {
      state.view = 'welcome'
      render()
      const box = $('#verifyMessage')
      if (box) box.innerHTML = '<div class="status-box status-info">Voting is currently paused. Please ask the election administrator to open voting.</div>'
      return
    }
    state.view = 'welcome'
    state.kioskActive = true
    state.kioskLocked = false
    clearVotingSession()
    render()
  }

  const onLogin = async event => {
    event.preventDefault()
    const email = $('#adminEmail').value.trim()
    const password = $('#adminPassword').value
    const submit = event.currentTarget.querySelector('button[type="submit"]')
    submit.disabled = true; submit.textContent = 'VERIFYING…'
    try {
      const { data, error } = await state.client.auth.signInWithPassword({ email, password })
      if (error || !data.session) throw new Error(error?.message || 'Sign-in failed.')
      state.session = data.session
      state.adminEmail = data.user.email || email
      await loadAdminData()
      showToast('Administrator access verified.', 'success')
    } catch (err) {
      const msg = $('#loginMessage')
      if (msg) msg.innerHTML = `<div class="status-box status-error">${esc(err.message)}</div>`
      submit.disabled = false; submit.textContent = 'SECURE ADMIN SIGN IN'
    }
  }

  const onVerify = async event => {
    event.preventDefault()
    if (!state.session || !state.kioskActive) {
      const message = $('#verifyMessage')
      if (message) message.innerHTML = '<div class="status-box status-info">This station has not been unlocked by the election administrator. Select Administration, sign in, and open the voting kiosk.</div>'
      return
    }
    const identifier = $('#identifier').value.trim()
    const confirm_name = $('#confirmName').value.trim()
    const course = $('#course').value.trim()
    const message = $('#verifyMessage')
    const button = event.currentTarget.querySelector('button[type="submit"]')
    button.disabled = true; button.textContent = 'VERIFYING VOTER…'
    try {
      const result = await api('verify', { identifier, confirm_name, course })
      if (result?.status !== 'verified') {
        message.innerHTML = `<div class="status-box ${result?.status==='already_voted'?'status-info':'status-error'}">${esc(result?.message || 'Voter verification failed.')}</div>`
        return
      }
      state.voterName = result.voter_name
      state.ticket = result.ticket
      sessionStorage.setItem(ticketKey, result.ticket)
      state.selections = {}
      state.step = 0
      state.kioskLocked = true
      localStorage.removeItem(ballotKey); localStorage.removeItem(stepKey)
      state.view = 'vote'
      render()
      const box = document.createElement('div')
      box.className = 'status-box status-ok'
      box.textContent = `Voter verified successfully. Welcome, ${result.voter_name}. Your eligibility has been confirmed.`
      app.insertBefore(box, app.firstChild)
      showToast('Voter verified successfully.', 'success')
    } catch (err) {
      message.innerHTML = `<div class="status-box status-error">${esc(err.message)}</div>`
    } finally {
      if (button.isConnected) { button.disabled = false; button.textContent = 'VERIFY & CONTINUE' }
    }
  }

  const selectCandidate = id => {
    const position = currentPosition()
    if (!position) return
    if (!currentCandidates().some(c => c.id === id)) return
    state.selections[position.position_key] = id
    saveBallot()
    render()
  }
  const nextPosition = () => {
    const pos = currentPosition()
    if (!pos || !state.selections[pos.position_key]) return
    if (state.step < state.positions.length - 1) state.step += 1
    else state.view = 'review'
    saveBallot(); render()
  }
  const confirmSubmit = async () => {
    if (!window.confirm('Are you sure you want to submit this final ballot? Once submitted, it cannot be changed.')) return
    const selections = state.positions.map(p => ({ position_key: p.position_key, candidate_id: state.selections[p.position_key] }))
    if (selections.some(s => !s.candidate_id)) return showToast('Complete every position before submitting.', 'error')
    showLoading('Recording your anonymous ballot…')
    try {
      const result = await api('submit', { ticket: state.ticket, selections })
      if (result?.status !== 'recorded') throw new Error('The ballot could not be confirmed.')
      state.ticket = ''
      sessionStorage.removeItem(ticketKey)
      localStorage.removeItem(ballotKey); localStorage.removeItem(stepKey)
      state.view = 'success'
      render()
      showToast('Your vote has been recorded.', 'success')
    } catch (err) {
      state.view = 'review'; render()
      showToast(err.message, 'error')
    }
  }

  const cancelVoting = async () => {
    if (!window.confirm('Cancel this unfinished voting session and return to voter verification? No ballot will be recorded.')) return
    try { if (state.ticket) await api('cancel', { ticket: state.ticket }) } catch (err) { showToast(err.message, 'error') }
    clearVotingSession(); state.view = 'welcome'; render()
  }
  const finishVoting = () => {
    clearVotingSession()
    state.view = 'welcome'
    render()
  }
  const refreshAdmin = async () => {
    try { await loadAdminData(); showToast('Dashboard refreshed.', 'success') }
    catch (err) { showToast(err.message, 'error') }
  }
  const saveSettings = async () => {
    const voting_open = $('#votingToggle')?.checked === true
    const results_released = $('#resultsToggle')?.checked === true
    const result = await api('settings', { voting_open, results_released })
    state.settings = result || { voting_open, results_released }
    await refreshAdmin()
    showToast('Election settings saved.', 'success')
  }
  const doLogout = async () => {
    if (!window.confirm('Log out of the election administration panel?')) return
    await state.client.auth.signOut()
    state.session = null; state.adminEmail = ''; state.view = 'login'; state.kioskLocked = false; state.kioskActive = false; render()
  }

  const openCandidateModal = candidate => {
    state.editCandidate = candidate || null
    const c = candidate || { position_key: state.positions[0]?.position_key, full_name: '', photo_url: '', group_name: '', active: true, sort_order: 1 }
    const positionOptions = state.positions.map(p => `<option value="${esc(p.position_key)}" ${p.position_key===c.position_key?'selected':''}>${esc(p.label)}</option>`).join('')
    const backdrop = document.createElement('div')
    backdrop.className = 'modal-backdrop'
    backdrop.id = 'candidateModal'
    backdrop.innerHTML = `<form class="modal" id="candidateForm"><h2>${candidate ? 'Edit candidate' : 'Add candidate'}</h2><p>Candidate data is stored in the private election database. Photo URL can point to an image in this GitHub repository.</p>
      <div class="field"><label>POSITION</label><select name="position_key" required>${positionOptions}</select></div>
      <div class="field"><label>CANDIDATE NAME</label><input name="full_name" required maxlength="120" value="${esc(c.full_name)}"></div>
      <div class="field"><label>PHOTO URL / PATH</label><input name="photo_url" maxlength="500" value="${esc(c.photo_url || '')}" placeholder="assets/candidates/candidate-01.jpg"></div>
      <div class="field"><label>GROUP (OPTIONAL)</label><input name="group_name" maxlength="120" value="${esc(c.group_name || '')}"></div>
      <div class="field"><label>SORT ORDER</label><input name="sort_order" type="number" min="0" value="${Number(c.sort_order || 0)}"></div>
      <div class="toggle-row"><div><strong>Active on ballot</strong><small>Inactive candidates are hidden from voters.</small></div><input name="active" class="switch" type="checkbox" ${c.active ? 'checked' : ''}></div>
      <div class="modal-actions"><button class="btn btn-light" type="button" data-action="close-modal">CANCEL</button><button class="btn btn-primary" type="submit">SAVE CANDIDATE</button></div></form>`
    document.body.append(backdrop)
  }
  const onCandidateSave = async event => {
    event.preventDefault()
    const f = new FormData(event.currentTarget)
    const c = state.editCandidate
    await api('candidate_save', {
      id: c?.id || null,
      position_key: f.get('position_key'),
      full_name: f.get('full_name'),
      photo_url: f.get('photo_url'),
      group_name: f.get('group_name'),
      active: f.get('active') === 'on',
      sort_order: Number(f.get('sort_order') || 0)
    })
    $('#candidateModal')?.remove()
    const boot = await api('bootstrap')
    state.positions = boot.positions || []; state.candidates = boot.candidates || []
    render(); showToast('Candidate record saved.', 'success')
  }
  const toggleCandidate = async id => {
    const candidate = state.candidates.find(c => c.id === id)
    if (!candidate) return
    const verb = candidate.active ? 'disable' : 'enable'
    if (!window.confirm(`Are you sure you want to ${verb} ${candidate.full_name}?`)) return
    await api('candidate_save', { ...candidate, active: !candidate.active })
    const boot = await api('bootstrap')
    state.positions = boot.positions || []; state.candidates = boot.candidates || []
    render(); showToast(`Candidate ${verb}d.`, 'success')
  }

  const readVoterWorkbook = async file => {
    const bytes = await file.arrayBuffer()
    const workbook = XLSX.read(bytes, { type: 'array', cellText: true, cellDates: false })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
    if (grid.length < 2) throw new Error('The selected workbook has no voter rows.')
    const headers = grid[0].map(x => String(x).trim().toLowerCase())
    const findCol = names => headers.findIndex(h => names.includes(h))
    const index = {
      sl: findCol(['sl no.','sl no','sl. no.','serial no']),
      name: findCol(['name','full name','voter name']),
      course: findCol(['course / class','course/class','course','class']),
      roll: findCol(['enrollment no.','enrollment no','enrolment no.','enrolment no','roll number','roll no']),
      mobile: findCol(['mobile no.','mobile no','mobile number','phone'])
    }
    if (index.name < 0) throw new Error('The workbook must include a Name column.')
    const rows = []
    let blankRoll = 0, blankMobile = 0, blankName = 0
    for (let i = 1; i < grid.length; i++) {
      const row = grid[i]
      const full_name = String(row[index.name] ?? '').trim()
      if (!full_name) { blankName++; continue }
      // Workbook SL No. restarts in different class sections and repeats in one section.
      // Use the physical spreadsheet row as the stable import reference, never SL No. alone.
      const source_ref = `RCSU26-ROW-${i+1}`
      const enrollment_no = index.roll >= 0 ? String(row[index.roll] ?? '').trim() : ''
      const mobile_no = index.mobile >= 0 ? String(row[index.mobile] ?? '').trim() : ''
      if (!enrollment_no) blankRoll++
      if (!mobile_no) blankMobile++
      rows.push({ source_ref, full_name, course: index.course >= 0 ? String(row[index.course] ?? '').trim() : '', enrollment_no, mobile_no, eligible: true })
    }
    return { rows, blankRoll, blankMobile, blankName }
  }
  let importRows = []
  const onFileChosen = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    $('#importPreview').textContent = 'Reading voter workbook…'
    $('#runImport').disabled = true
    try {
      const parsed = await readVoterWorkbook(file)
      importRows = parsed.rows
      $('#importPreview').innerHTML = `<div class="status-box status-info"><strong>${fmt(importRows.length)} records ready.</strong><br>${fmt(parsed.blankRoll)} without enrolment number · ${fmt(parsed.blankMobile)} without mobile number · ${fmt(parsed.blankName)} blank-name rows skipped.<br><span class="subtle">The workbook is parsed in memory and is not saved to the public website repository.</span></div>`
      $('#runImport').disabled = importRows.length === 0
    } catch (err) {
      importRows = []
      $('#importPreview').innerHTML = `<div class="status-box status-error">${esc(err.message)}</div>`
    }
  }
  const runImport = async () => {
    if (!importRows.length) return
    const total = importRows.length
    if (!window.confirm(`Import ${fmt(total)} voter records into the private election register? This will create/update voter records only; it will not create votes.`)) return
    const button = $('#runImport')
    button.disabled = true; button.textContent = 'IMPORTING 0%…'
    let inserted = 0, updated = 0, skipped = 0
    try {
      for (let i = 0; i < importRows.length; i += 300) {
        const result = await api('import', { rows: importRows.slice(i, i + 300) })
        inserted += Number(result?.inserted || 0); updated += Number(result?.updated || 0); skipped += Number(result?.skipped || 0)
        button.textContent = `IMPORTING ${Math.round(Math.min(i+300,total)/total*100)}%…`
      }
      importRows = []
      $('#importPreview').innerHTML = `<div class="status-box status-ok">Import completed. ${fmt(inserted)} inserted · ${fmt(updated)} updated · ${fmt(skipped)} skipped.</div>`
      button.textContent = 'IMPORT COMPLETE'
      await refreshAdmin()
      showToast('Voter register import completed.', 'success')
    } catch (err) {
      button.disabled = false; button.textContent = 'RETRY IMPORT'
      showToast(`Import stopped: ${err.message}. Re-upload the workbook to safely continue; matching serial references are updated.`, 'error')
    }
  }

  const updateResultsFilter = () => {
    const target = $('#resultsPanel')
    if (target) target.innerHTML = resultsTemplate(state.dashboard,state.resultSearch,state.resultPosition)
  }

  const exportResults = () => {
    const rows = [['Position','Candidate','Votes','Percentage']]
    ;(state.dashboard?.results || []).forEach(r => rows.push([r.position,r.candidate,r.votes,r.percentage]))
    if (rows.length === 1) return showToast('There are no result rows to export.', 'error')
    const csv = rows.map(row => row.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\r\n')
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'RCSU-Election-2026-2027-Aggregated-Results.csv'; a.click()
    URL.revokeObjectURL(url)
  }
  const sendReport = async () => {
    if (!window.confirm('Are you sure you want to send the complete voting report to the administrator? The email will contain aggregated totals only, not voter identities or individual ballots.')) return
    showToast('Preparing administrator report…')
    try {
      const [dashboard, boot] = await Promise.all([api('dashboard'), api('bootstrap')])
      const byPosition = (dashboard.results || []).reduce((acc,r) => {
        (acc[r.position] ||= []).push(`${r.candidate}: ${r.votes} votes (${Number(r.percentage).toFixed(2)}%)`)
        return acc
      }, {})
      const report = [
        'RAHA COLLEGE STUDENT UNION ELECTION 2026–2027',
        `Report generated: ${new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}`,
        `Total registered voters: ${dashboard.total_voters}`,
        `Total eligible voters: ${dashboard.eligible_voters}`,
        `Total ballots submitted: ${dashboard.votes_cast}`,
        `Remaining voters: ${dashboard.remaining_voters}`,
        `Participation: ${dashboard.participation}%`,
        `Voting status: ${boot.settings?.voting_open ? 'Open' : 'Paused'}`,
        `Results release authorised: ${dashboard.results_released ? 'Yes' : 'No'}`,
        '', 'POSITION-WISE AGGREGATED RESULTS',
        ...Object.entries(byPosition).flatMap(([p, lines]) => [`\n${p}`, ...lines]),
        '', 'Privacy note: This report contains aggregated totals only. It does not contain voter identities or individual ballot selections.'
      ].join('\n')
      const reportPayload = {
        Election: 'Raha College Student Union Election 2026–2027',
        _subject: 'Raha College Student Union Election 2026–2027 — Voting Report',
        _template: 'table',
        'Voting Report': report,
        _captcha: 'true'
      }
      const response = await fetch('https://formsubmit.co/ajax/rahacollegenss@gmail.com', {
        method:'POST', headers:{Accept:'application/json','Content-Type':'application/json'},
        body:JSON.stringify(reportPayload)
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success === 'false' || result.success === false) throw new Error(result.message || 'FormSubmit could not confirm delivery.')
      showToast('REPORT SENT SUCCESSFULLY', 'success')
    } catch (err) { showToast(`Report not confirmed: ${err.message}. Check FormSubmit email activation and try again.`, 'error') }
  }
  const resetElection = async () => {
    const phrase = window.prompt('This deletes all ballots and marks every voter as not voted. Candidate and voter records remain. Type RESET ELECTION to continue:')
    if (phrase !== 'RESET ELECTION') return showToast('Election reset cancelled.', 'error')
    if (!window.confirm('Final confirmation: permanently clear all recorded ballots? This cannot be undone.')) return
    await api('reset')
    await refreshAdmin()
    showToast('Election ballot data has been reset. Voting is paused.', 'success')
  }

  const delegatedClick = async event => {
    const el = event.target.closest('[data-action]')
    if (!el) return
    const action = el.dataset.action
    try {
      if (action === 'select-candidate') selectCandidate(el.dataset.id)
      else if (action === 'next-position') nextPosition()
      else if (action === 'confirm-submit') await confirmSubmit()
      else if (action === 'cancel-vote') await cancelVoting()
      else if (action === 'finish') finishVoting()
      else if (action === 'refresh-admin') await refreshAdmin()
      else if (action === 'start-kiosk') await startKiosk()
      else if (action === 'logout') await doLogout()
      else if (action === 'save-settings') await saveSettings()
      else if (action === 'open-candidates') { const boot=await api('bootstrap');state.positions=boot.positions||[];state.candidates=boot.candidates||[];state.view='candidates';render() }
      else if (action === 'open-import') { state.view='import';render() }
      else if (action === 'back-admin') await loadAdminData()
      else if (action === 'add-candidate') openCandidateModal({position_key:el.dataset.position,active:true,sort_order:1})
      else if (action === 'edit-candidate') openCandidateModal(state.candidates.find(c=>c.id===el.dataset.id))
      else if (action === 'toggle-candidate') await toggleCandidate(el.dataset.id)
      else if (action === 'close-modal') $('#candidateModal')?.remove()
      else if (action === 'run-import') await runImport()
      else if (action === 'export-results') exportResults()
      else if (action === 'print-results') window.print()
      else if (action === 'send-report') await sendReport()
      else if (action === 'reset-election') await resetElection()
      else if (action === 'edit-position') { state.step=Number(el.dataset.step);state.view='vote';saveBallot();render() }
    } catch (err) { showToast(err.message || 'Action failed.', 'error') }
  }

  const init = async () => {
    if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes('YOUR_PROJECT_REF') || !CFG.SUPABASE_PUBLISHABLE_KEY || CFG.SUPABASE_PUBLISHABLE_KEY.includes('YOUR_SUPABASE')) {
      state.view = 'config'; render(); return
    }
    if (!window.supabase?.createClient) { state.view = 'config'; render(); return }
    state.client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
    })
    const session = await getSession()
    state.view = 'welcome'
    if (!session) { render(); return }
    state.adminEmail = session.user.email || 'Administrator'
    const ticket = sessionStorage.getItem(ticketKey)
    if (ticket) {
      try {
        const boot = await api('bootstrap')
        const restored = await api('resume', {ticket})
        if (restored?.status === 'resumed') {
          state.settings = boot.settings || {}
          state.positions = boot.positions || []
          state.candidates = boot.candidates || []
          state.ticket = ticket; state.voterName = restored.voter_name
          state.selections = readBallot()
          const savedStep = Number(localStorage.getItem(stepKey)||0)
          state.step = Number.isFinite(savedStep) ? Math.max(0,Math.min(savedStep,state.positions.length-1)) : 0
          state.kioskActive = true; state.kioskLocked = true; state.view = 'vote'; render()
          const note = document.createElement('div');note.className='status-box status-info';note.textContent=`Voting session restored. Welcome, ${state.voterName}.`;app.insertBefore(note,app.firstChild)
          return
        }
      } catch (err) { showToast(`The previous voting session could not be restored: ${err.message}`, 'error') }
      clearVotingSession()
    }
    render()
  }

  adminShortcut.addEventListener('click', () => {
    if (state.kioskLocked || state.kioskActive) return
    state.view = 'login'; render()
  })
  app.addEventListener('submit', event => {
    if (event.target.id === 'loginForm') onLogin(event)
    else if (event.target.id === 'verifyForm') onVerify(event)
    else if (event.target.id === 'candidateForm') onCandidateSave(event).catch(err=>showToast(err.message,'error'))
  })
  app.addEventListener('click', event => delegatedClick(event))
  app.addEventListener('change', event => {
    if (event.target.id === 'voterFile') onFileChosen(event)
    else if (event.target.id === 'positionFilter') { state.resultPosition=event.target.value; updateResultsFilter() }
  })
  app.addEventListener('input', event => {
    if (event.target.id === 'candidateSearch') { state.resultSearch=event.target.value; updateResultsFilter() }
  })
  init().catch(err => { state.view='config';render();showToast(err.message,'error') })

  window.addEventListener('keydown', async event => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a' && state.kioskActive) {
      event.preventDefault()
      if (!window.confirm('Leave the voting kiosk and return to administrator sign-in?')) return
      try { if (state.ticket) await api('cancel', {ticket:state.ticket}) } catch {}
      clearVotingSession()
      state.kioskActive = false
      state.view = 'login'
      render()
    }
  })

})()

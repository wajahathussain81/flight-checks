import { useState } from 'react'
import { putSettingsBatch, testSeatsAero, testEmail } from './api.js'

const DEFAULT_RATIOS: Record<string, number> = { aeroplan: 1, british: 1, flyingblue: 0.75, delta: 0.75, etihad: 0.75 }

export function Wizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [key, setKey] = useState('')
  const [origin, setOrigin] = useState('YYC')
  const [program, setProgram] = useState('Amex MR (Canada)')
  const [balance, setBalance] = useState('220000')
  const [currency, setCurrency] = useState('CAD')
  const [ratios, setRatios] = useState<Array<[string, string]>>(Object.entries(DEFAULT_RATIOS).map(([k, v]) => [k, String(v)]))
  const [wantEmail, setWantEmail] = useState(false)
  const [smtp, setSmtp] = useState({ host: 'smtp.gmail.com', port: '465', user: '', password: '' })
  const [digestTo, setDigestTo] = useState('')

  const testKey = async () => {
    setBusy(true)
    const r = await testSeatsAero(key).catch(e => ({ ok: false, message: String(e) }))
    setMsg({ ok: r.ok, text: r.message }); setBusy(false)
  }
  const testMail = async () => {
    setBusy(true)
    const r = await testEmail({ ...smtp, port: Number(smtp.port) }, digestTo).catch(e => ({ ok: false, message: String(e) }))
    setMsg({ ok: r.ok, text: r.message }); setBusy(false)
  }
  const finish = async () => {
    setBusy(true)
    const settings: Array<{ key: string; value: string | null }> = [
      { key: 'seatsAeroKey', value: key },
      { key: 'origin', value: origin.toUpperCase() },
      { key: 'pointsProgram', value: program },
      { key: 'pointsBalance', value: balance },
      { key: 'currency', value: currency },
      { key: 'ratios', value: JSON.stringify(Object.fromEntries(ratios.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), Number(v)]))) },
      { key: 'digestEnabled', value: wantEmail ? 'true' : 'false' },
    ]
    if (wantEmail) settings.push(
      { key: 'smtp.host', value: smtp.host }, { key: 'smtp.port', value: smtp.port },
      { key: 'smtp.user', value: smtp.user }, { key: 'smtp.password', value: smtp.password },
      { key: 'digestTo', value: digestTo },
    )
    try { await putSettingsBatch(settings); onDone() }
    catch (e) { setMsg({ ok: false, text: String(e) }) }
    setBusy(false)
  }

  return (
    <div className="wizard">
      <h1>✈️ Flight Checks</h1>
      <p className="wizard-sub">Award-flight deal watcher. Three steps and you're scanning.</p>
      <div className="wizard-steps">{[1, 2, 3].map(n => <span key={n} className={n === step ? 'active' : n < step ? 'done' : ''}>{n}</span>)}</div>

      {step === 1 && <section>
        <h2>Connect seats.aero</h2>
        <label>Partner API key <input className="field" type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="pro_..." /></label>
        <label>Home airport <input className="field" value={origin} onChange={e => setOrigin(e.target.value)} maxLength={3} placeholder="YYC" /></label>
        <div className="wizard-actions">
          <button className="btn btn-tinted" disabled={!key || busy} onClick={testKey}>Test connection</button>
          <button className="btn btn-primary" disabled={!key || !/^[A-Za-z]{3}$/.test(origin)} onClick={() => { setMsg(null); setStep(2) }}>Next</button>
        </div>
      </section>}

      {step === 2 && <section>
        <h2>Your points</h2>
        <label>Program name <input className="field" value={program} onChange={e => setProgram(e.target.value)} /></label>
        <label>Balance <input className="field" type="number" value={balance} onChange={e => setBalance(e.target.value)} /></label>
        <label>Currency label <input className="field" value={currency} onChange={e => setCurrency(e.target.value)} maxLength={3} /></label>
        <h3>Transfer ratios <small>(seats.aero source → points per program mile)</small></h3>
        {ratios.map(([k, v], i) => (
          <div key={i} className="ratio-row">
            <input className="field" value={k} onChange={e => setRatios(r => r.map((x, j) => j === i ? [e.target.value, x[1]] : x))} />
            <input className="field" type="number" step="0.05" value={v} onChange={e => setRatios(r => r.map((x, j) => j === i ? [x[0], e.target.value] : x))} />
            <button className="icon-btn" aria-label="Remove program" onClick={() => setRatios(r => r.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="btn btn-sm btn-tinted" onClick={() => setRatios(r => [...r, ['', '1']])}>Add program</button>
        <div className="wizard-actions">
          <button className="btn btn-plain" onClick={() => setStep(1)}>Back</button>
          <button className="btn btn-primary" disabled={ratios.filter(([k]) => k.trim()).length === 0} onClick={() => { setMsg(null); setStep(3) }}>Next</button>
        </div>
      </section>}

      {step === 3 && <section>
        <h2>Email digest <small>(optional)</small></h2>
        <label className="check"><input className="field" type="checkbox" checked={wantEmail} onChange={e => setWantEmail(e.target.checked)} /> Email me a digest after each scheduled scan</label>
        {wantEmail && <>
          <label>SMTP host <input className="field" value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} /></label>
          <label>Port <input className="field" type="number" value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: e.target.value }))} /></label>
          <label>User <input className="field" value={smtp.user} onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))} /></label>
          <label>Password <input className="field" type="password" value={smtp.password} onChange={e => setSmtp(s => ({ ...s, password: e.target.value }))} /></label>
          <label>Send digest to <input className="field" value={digestTo} onChange={e => setDigestTo(e.target.value)} /></label>
          <button className="btn btn-tinted" disabled={busy || !smtp.user || !smtp.password || !digestTo} onClick={testMail}>Send test email</button>
        </>}
        <div className="wizard-actions">
          <button className="btn btn-plain" onClick={() => setStep(2)}>Back</button>
          <button className="btn btn-primary" disabled={busy} onClick={finish}>Finish</button>
        </div>
      </section>}

      {msg && <p className={msg.ok ? 'wizard-ok' : 'wizard-err'}>{msg.text}</p>}
    </div>
  )
}

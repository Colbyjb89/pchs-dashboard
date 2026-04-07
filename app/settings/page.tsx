'use client';
import { useState, useRef, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import { METRIC_CONFIG, MetricKey } from '@/lib/types';
import { InjuryStatus, InjuryRecord } from '@/lib/types';
import { saveInjuryUpload, clearAllInjuryData, getCurrentInjuries, getLastUpdated, getInjuryHistory } from '@/lib/injuries';

const BRIEFING_ITEMS = [
  { key: 'week-load-trend', label: 'Week Load Trend vs. Last Week', description: 'Compares current week cumulative team Player Load to the same point last week.' },
  { key: 'flagged-athletes', label: 'Flagged Athletes', description: 'Any player whose session metric deviated beyond defined thresholds.' },
  { key: 'acwr-red-zone', label: 'Players in ACWR Red Zone', description: 'Athletes whose acute:chronic workload ratio falls below 0.5 or above 1.3.' },
  { key: 'new-personal-maxes', label: 'New Personal Maxes', description: 'Any athlete who hit a career high in any metric during the most recent session.' },
  { key: 'not-seen', label: 'Players Not Seen in 4+ Days', description: 'Athletes with no logged session in the past 4 days, flagged for follow-up.' },
  { key: 'position-group-health', label: 'Position Group Health Summary', description: 'One-line status per position group showing avg load vs. norm and ACWR traffic light.' },
  { key: 'highest-loaded', label: 'Highest Loaded Player', description: 'Single callout for the athlete who took on the greatest Player Load in the most recent session.' },
  { key: 'team-acwr-trend', label: 'Team ACWR Trend', description: 'Team-level acute:chronic ratio direction, flagging overload or underload trends.' },
  { key: 'position-group-outlier', label: 'Position Group Outlier', description: 'Which position group deviated most from their seasonal norm in the last session.' },
  { key: 'week-in-review', label: 'Week in Review (Friday only)', description: 'Full week recap of load, speed band progress, and flagged athletes. Sent Friday evenings.' },
  { key: 'game-week-readiness', label: 'Game Week Readiness Score (Thursday only)', description: 'Single team-level score summarizing physical preparedness for the upcoming game.' },
  { key: 'consecutive-high-load', label: 'Consecutive High Load Days', description: 'Any player who has logged high load sessions on back-to-back days, flagging cumulative fatigue risk.' },
  { key: 'return-from-absence', label: 'Return from Absence', description: 'Any player returning after 4+ days away, flagged for monitored reintegration.' },
  { key: 'practice-efficiency', label: 'Practice Efficiency', description: 'Player Load per minute trending up or down across the week.' },
  { key: 'speed-band-summary', label: 'Position Group Speed Band Summary', description: 'Which groups are on track or behind on HSY and Max Velocity effort targets for the week.' },
  { key: 'weather', label: 'Next Day Weather Brief', description: 'Next-day forecast from Weather.gov. Excessive heat index projections flagged automatically.' },
  { key: 'injury-report', label: 'Injury Report Summary', description: 'Daily summary of injured FB athletes. Cross-references GPS data with injury status to flag conflicts.' },
];

export default function Settings() {
  const [passwordInput, setPasswordInput] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [wrongPw, setWrongPw] = useState(false);
  const [avaOpen, setAvaOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('thresholds');

  // Settings state
  const [acwrGreenMin, setAcwrGreenMin] = useState(0.8);
  const [acwrGreenMax, setAcwrGreenMax] = useState(1.3);
  const [acwrYellowMin, setAcwrYellowMin] = useState(0.5);
  const [notSeenDays, setNotSeenDays] = useState(4);
  const [minSessions, setMinSessions] = useState(4);
  const [heatThreshold, setHeatThreshold] = useState(103);
  const [weatherLocation, setWeatherLocation] = useState('Pell City, AL');
  const [seasonStart, setSeasonStart] = useState('2026-01-01');
  const [briefingTime, setBriefingTime] = useState('19:00');
  const [emailSubject, setEmailSubject] = useState('PCHS Football — Daily Performance Brief');
  const [newEmail, setNewEmail] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [briefingToggles, setBriefingToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(BRIEFING_ITEMS.map(i => [i.key, true]))
  );
  const [saved, setSaved] = useState(false);
  const [injuryRecords, setInjuryRecords] = useState<InjuryRecord[]>([]);
  const [injuryLastUpdated, setInjuryLastUpdated] = useState('');
  const [injuryError, setInjuryError] = useState('');
  const [injuryUploading, setInjuryUploading] = useState(false);
  const injuryFileRef = useRef<HTMLInputElement>(null);

  // Load persisted injury data on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pchs_injury_records');
      const storedDate = localStorage.getItem('pchs_injury_updated');
      if (stored) setInjuryRecords(JSON.parse(stored));
      if (storedDate) setInjuryLastUpdated(storedDate);
    } catch {}
  }, []);

  function tryUnlock() {
    // In production this checks against env var SETTINGS_PASSWORD
    // For now check against default
    if (passwordInput === 'pchs2026' || passwordInput === process.env.NEXT_PUBLIC_SETTINGS_PW) {
      setUnlocked(true);
      setWrongPw(false);
    } else {
      setWrongPw(true);
    }
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!unlocked) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <Navigation />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 100px)' }}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 16, padding: '40px', width: '100%', maxWidth: 380, textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚙</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, marginBottom: 6, letterSpacing: '0.04em' }}>
              Settings
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
              Enter your settings password to continue
            </div>
            <input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && tryUnlock()}
              placeholder="Password"
              autoFocus
              style={{
                width: '100%', background: 'var(--surface)', border: `1px solid ${wrongPw ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14,
                outline: 'none', marginBottom: 12, fontFamily: 'var(--font-body)',
              }}
            />
            {wrongPw && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>Incorrect password</div>}
            <button onClick={tryUnlock} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Unlock Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  function parseInjuryCSV(text: string): InjuryRecord[] {
    const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim());
    const records: InjuryRecord[] = [];
    let headerFound = false;
    for (const line of lines) {
      if (!headerFound) {
        if (line.startsWith('Name,Part')) { headerFound = true; }
        continue;
      }
      if (!line || line.startsWith(',,,') || line.startsWith('OUT,') || line.startsWith('4/') || line.startsWith('Fall Medical') || line.startsWith('Winter Medical') || line.startsWith('Spring Medical')) continue;
      // Parse CSV with quoted fields
      const fields: string[] = [];
      let cur = ''; let inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      fields.push(cur.trim());
      if (fields.length < 5) continue;
      const [name, part, injury, status, dateReported, info, expectedReturn, , sport] = fields;
      if (!name || !part || !injury || !status) continue;
      // FB athletes only
      if (!sport?.toUpperCase().includes('FB')) continue;
      const cleanStatus = status.replace('Fulll', 'Full') as InjuryStatus;
      const validStatuses: InjuryStatus[] = ['OUT', 'Limited', 'As Tolerated', 'Full Go'];
      if (!validStatuses.includes(cleanStatus)) continue;
      records.push({ name: name.replace(/^"|"$/g, ''), part, injury, status: cleanStatus, dateReported, info: info || '', expectedReturn: expectedReturn || 'TBD', sport });
    }
    return records;
  }

  function handleInjuryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setInjuryUploading(true);
    setInjuryError('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const parsed = parseInjuryCSV(text);
        if (parsed.length === 0) {
          setInjuryError('No FB athletes found. Check that athletes have "FB" in the Sport column.');
        } else {
          saveInjuryUpload(parsed);
          const dateStr = new Date().toLocaleString();
          setInjuryRecords(parsed);
          setInjuryLastUpdated(dateStr);
          setInjuryError('');
        }
      } catch (err) { setInjuryError(`Parse error: ${err}`); }
      finally { setInjuryUploading(false); if (injuryFileRef.current) injuryFileRef.current.value = ''; }
    };
    reader.readAsText(file);
  }

  function clearInjuryData() {
    clearAllInjuryData();
    setInjuryRecords([]);
    setInjuryLastUpdated('');
  }

  const TABS = [
    { key: 'thresholds', label: 'Thresholds' },
    { key: 'flags',      label: 'Flags' },
    { key: 'ava',        label: 'Ava & Briefing' },
    { key: 'weather',    label: 'Weather' },
    { key: 'season',     label: 'Season' },
    { key: 'roster',     label: 'Roster' },
    { key: 'injury',     label: 'Injury Report' },
  ];

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 80 }}>
      <Navigation />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Settings
            </h1>
            <p style={{ fontSize: 12, color: 'var(--green)', marginTop: 2 }}>✓ Unlocked</p>
          </div>
          <button onClick={handleSave} className="btn btn-primary">
            {saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>

        {/* Tab Nav */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em',
              background: activeTab === t.key ? 'var(--accent)' : 'transparent',
              color: activeTab === t.key ? 'white' : 'var(--muted)', transition: 'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── Thresholds Tab ─────────────────────────── */}
        {activeTab === 'thresholds' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionHeader>ACWR Zones</SectionHeader>
            <SettingRow label="Green Zone Min" description="Lower bound of optimal training zone">
              <NumberInput value={acwrGreenMin} onChange={setAcwrGreenMin} step={0.05} min={0} max={2} />
            </SettingRow>
            <SettingRow label="Green Zone Max" description="Upper bound of optimal training zone">
              <NumberInput value={acwrGreenMax} onChange={setAcwrGreenMax} step={0.05} min={0} max={2} />
            </SettingRow>
            <SettingRow label="Yellow Zone Min" description="Lower bound of underload warning zone">
              <NumberInput value={acwrYellowMin} onChange={setAcwrYellowMin} step={0.05} min={0} max={2} />
            </SettingRow>

            <SectionHeader>Flags</SectionHeader>
            <SettingRow label="Not Seen Threshold (days)" description="Flag athletes absent for this many days">
              <NumberInput value={notSeenDays} onChange={setNotSeenDays} step={1} min={1} max={14} />
            </SettingRow>
            <SettingRow label="Min Sessions Before Flagging" description="Minimum session history required before flag activates">
              <NumberInput value={minSessions} onChange={setMinSessions} step={1} min={1} max={20} />
            </SettingRow>
          </div>
        )}

        {/* ── Flags Tab ──────────────────────────────── */}
        {activeTab === 'flags' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SectionHeader>Per-Metric Flag Thresholds</SectionHeader>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
              Percentage deviation from session average that triggers a flag
            </div>
            {Object.entries(METRIC_CONFIG).map(([key, cfg]) => (
              <div key={key} style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{cfg.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{cfg.flagDirection === 'above' ? 'Above only' : cfg.flagDirection === 'below' ? 'Below only' : 'Both directions'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" defaultValue={cfg.flagThreshold} min={1} max={100}
                    style={{ width: 60, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', color: 'var(--text)', fontSize: 13, textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Ava & Briefing Tab ─────────────────────── */}
        {activeTab === 'ava' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionHeader>Briefing Schedule</SectionHeader>
            <SettingRow label="Briefing Time" description="Daily time Ava generates and sends the brief">
              <input type="time" value={briefingTime} onChange={e => setBriefingTime(e.target.value)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }} />
            </SettingRow>
            <SettingRow label="Email Subject Line" description="Subject used for all briefing emails">
              <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 13, width: 300 }} />
            </SettingRow>

            <SectionHeader>Email Distribution</SectionHeader>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newEmail) { setEmails(prev => [...prev, newEmail]); setNewEmail(''); } }}
                placeholder="Add email address..."
                style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }} />
              <button onClick={() => { if (newEmail) { setEmails(prev => [...prev, newEmail]); setNewEmail(''); } }} className="btn btn-ghost">Add</button>
            </div>
            {emails.map((email, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                <span style={{ fontSize: 13 }}>{email}</span>
                <button onClick={() => setEmails(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12 }}>Revoke</button>
              </div>
            ))}

            <SectionHeader>Briefing Content Toggles</SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {BRIEFING_ITEMS.map(item => (
                <div key={item.key} style={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '12px 16px',
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                }}>
                  <button
                    onClick={() => setBriefingToggles(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                    style={{
                      width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 2,
                      background: briefingToggles[item.key] ? 'var(--accent)' : 'var(--dim)',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', background: 'white',
                      position: 'absolute', top: 3, transition: 'left 0.2s',
                      left: briefingToggles[item.key] ? 19 : 3,
                    }} />
                  </button>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: briefingToggles[item.key] ? 'var(--text)' : 'var(--muted)' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>
                      {item.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Weather Tab ────────────────────────────── */}
        {activeTab === 'weather' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionHeader>Weather Configuration</SectionHeader>
            <SettingRow label="Location" description="City/location used for weather data">
              <input type="text" value={weatherLocation} onChange={e => setWeatherLocation(e.target.value)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 13, width: 200 }} />
            </SettingRow>
            <SettingRow label="Heat Index Danger Threshold (°F)" description="Flag sessions when heat index exceeds this value (NOAA Danger = 103°F)">
              <NumberInput value={heatThreshold} onChange={setHeatThreshold} step={1} min={80} max={130} />
            </SettingRow>
          </div>
        )}

        {/* ── Season Tab ─────────────────────────────── */}
        {activeTab === 'season' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionHeader>Season Configuration</SectionHeader>
            <SettingRow label="Season Start Date" description="Beginning of current season — used for all seasonal calculations">
              <input type="date" value={seasonStart} onChange={e => setSeasonStart(e.target.value)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }} />
            </SettingRow>
            <SettingRow label="Week Accumulation Window" description="Current setting: Sunday–Saturday. Contact support to change.">
              <div style={{ fontSize: 12, color: 'var(--muted)', padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
                Sunday – Saturday
              </div>
            </SettingRow>
          </div>
        )}

        {/* ── Roster Tab ─────────────────────────────── */}
        {activeTab === 'roster' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionHeader>Inactive Players</SectionHeader>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Inactive players are hidden from reports but their data is preserved
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, color: 'var(--muted)', fontSize: 13 }}>
              Load roster from API to manage inactive players
            </div>
          </div>
        )}

        {/* ── Injury Tab ───────────────────────────────── */}
        {activeTab === 'injury' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SectionHeader>Injury Report Upload</SectionHeader>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, lineHeight: 1.6 }}>
              Upload the AT injury report CSV exported from Ahonen. Only athletes with <strong style={{ color: 'var(--text)' }}>FB</strong> in their Sport column will appear on the Injury Report page. Medical conditions are excluded automatically.
            </div>

            {/* Upload zone */}
            <div
              onClick={() => injuryFileRef.current?.click()}
              style={{ background: 'var(--surface)', border: '2px dashed var(--border)', borderRadius: 12, padding: '32px 24px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✚</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
                {injuryRecords.length > 0 ? 'Replace Injury CSV' : 'Upload Injury CSV'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {injuryLastUpdated ? `Last uploaded: ${injuryLastUpdated}` : 'No data uploaded yet'}
              </div>
            </div>
            <input ref={injuryFileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleInjuryUpload} />

            {injuryError && (
              <div style={{ background: 'rgba(255,23,68,0.1)', border: '1px solid rgba(255,23,68,0.3)', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: 'var(--red)' }}>
                {injuryError}
              </div>
            )}

            {injuryRecords.length > 0 && (
              <>
                {/* Summary */}
                <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.25)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: '#06d6a0' }}>{injuryRecords.length}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 8 }}>FB athletes loaded · {injuryLastUpdated}</span>
                    <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
                      {getInjuryHistory().length} total records in history
                    </div>
                  </div>
                  <button onClick={clearInjuryData} style={{ background: 'rgba(255,23,68,0.1)', border: '1px solid rgba(255,23,68,0.3)', borderRadius: 6, padding: '6px 14px', color: 'var(--red)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-display)' }}>
                    Clear Data
                  </button>
                </div>

                {/* Preview table */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                    Preview — {injuryRecords.length} records
                  </div>
                  <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface)' }}>
                          {['Athlete', 'Body Part', 'Injury', 'Status', 'Date', 'Return', 'Notes'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {injuryRecords.map((r, i) => {
                          const statusColor = r.status === 'OUT' ? 'var(--red)' : r.status === 'Limited' ? 'var(--orange)' : r.status === 'As Tolerated' ? 'var(--yellow)' : 'var(--green)';
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                              <td style={{ padding: '7px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name}</td>
                              <td style={{ padding: '7px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{r.part}</td>
                              <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>{r.injury}</td>
                              <td style={{ padding: '7px 12px', fontWeight: 700, color: statusColor, whiteSpace: 'nowrap' }}>{r.status}</td>
                              <td style={{ padding: '7px 12px', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap' }}>{r.dateReported}</td>
                              <td style={{ padding: '7px 12px', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap' }}>{r.expectedReturn}</td>
                              <td style={{ padding: '7px 12px', color: 'var(--muted)', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.info}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11,
      letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)',
      paddingBottom: 6, borderBottom: '1px solid var(--border)', marginTop: 8,
    }}>{children}</div>
  );
}

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{description}</div>
      </div>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange, step, min, max }: { value: number; onChange: (v: number) => void; step: number; min: number; max: number; }) {
  return (
    <input
      type="number" value={value} step={step} min={min} max={max}
      onChange={e => onChange(Number(e.target.value))}
      style={{ width: 80, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 13, textAlign: 'center' }}
    />
  );
}

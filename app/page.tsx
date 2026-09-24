'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Guest = { id: number; name: string; side: '신부측' | '신랑측'; group: string };
type TableState = { capacity: 8 | 9 | 10; seats: Array<number | null> };
type SideFilter = '전체' | '신부측' | '신랑측' | '미배정';
type SharedState = { guests: Guest[]; tables: TableState[]; tableOrder: number[] };
type HallSide = 'bride' | 'groom';
type SeatTarget = { tableIndex: number; seatIndex: number; excludeGuestId?: number };

const STORAGE_KEY = 'our-seats-v1';
const GROUPS = [
  '회사 동료2', '회사 동료1', '서울대 과', '도비 지인', '추가 지인', '오솔 지인',
  '고등학교', '중학교', '대학선배', '대학동기', '해병대', '대학원', '서울대',
  '친척', '친구', '직계', '외가', '친가', '동기', '룸메',
];

const BRIDE_TABLE_POSITIONS = [
  [72, 10], [28, 18], [72, 26], [28, 34], [72, 42],
  [28, 50], [72, 58], [28, 66], [72, 74], [50, 82], [50, 92],
];
const GROOM_TABLE_POSITIONS = [
  [28, 12], [72, 22], [28, 32], [72, 42], [28, 52],
  [72, 62], [28, 72], [72, 82], [50, 92],
];
const ANNEX_TABLE_POSITIONS = [[50, 27], [72, 73], [28, 73]];
const DEFAULT_TABLE_ORDER = Array.from({ length: 23 }, (_, index) => index);

function isValidTableOrder(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === 23
    && new Set(value).size === 23
    && value.every((index) => Number.isInteger(index) && index >= 0 && index < 23);
}

function tableSection(index: number) {
  if (index < 10 || index === 19) return 'bride';
  if (index < 19) return 'groom';
  return 'annex';
}

function emptyTables(): TableState[] {
  return Array.from({ length: 23 }, () => ({ capacity: 10, seats: Array(10).fill(null) }));
}

function normalizeSavedState(value: unknown): SharedState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SharedState>;
  if (!Array.isArray(candidate.guests) || !candidate.guests.length || !Array.isArray(candidate.tables)) return null;
  if (candidate.tables.length !== 20 && candidate.tables.length !== 23) return null;
  const guestsAreValid = candidate.guests.every((guest) => guest
    && typeof guest.id === 'number'
    && typeof guest.name === 'string'
    && (guest.side === '신부측' || guest.side === '신랑측')
    && typeof guest.group === 'string');
  const tablesAreValid = candidate.tables.every((table) => table
    && (table.capacity === 8 || table.capacity === 9 || table.capacity === 10)
    && Array.isArray(table.seats)
    && table.seats.length === 10
    && table.seats.every((id) => id === null || typeof id === 'number'));
  if (!guestsAreValid || !tablesAreValid) return null;
  const tables = candidate.tables.length === 20
    ? [...candidate.tables, ...emptyTables().slice(20)]
    : candidate.tables;
  const tableOrder = isValidTableOrder(candidate.tableOrder) ? candidate.tableOrder : [...DEFAULT_TABLE_ORDER];
  return { guests: candidate.guests, tables, tableOrder };
}

function parseCompactRoster(raw: string): Guest[] {
  const pattern = new RegExp(`(.+?)(신부측|신랑측)\\s*\\/\\s*(${GROUPS.join('|')})`, 'g');
  const guests: Guest[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    const name = match[1].replace(/^이름구분/, '').replace(/\\\\\*/g, '*').trim();
    if (name) guests.push({ id: guests.length + 1, name, side: match[2] as Guest['side'], group: match[3] });
  }
  return guests;
}

function parsePastedRoster(raw: string): Guest[] {
  const compact = parseCompactRoster(raw.replace(/\r/g, '').trim());
  if (compact.length > 1) return compact;
  const lines = raw.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const guests: Guest[] = [];
  for (const [index, line] of lines.entries()) {
    const cells = line.includes('\t') ? line.split('\t') : line.split(/\s*,\s*/);
    if (index === 0 && cells.some((cell) => cell.trim() === '이름')) continue;
    const name = (cells[0] || '').trim();
    const category = cells.slice(1).join(' ').trim();
    if (!name) continue;
    const side: Guest['side'] = category.includes('신랑') ? '신랑측' : '신부측';
    const group = category.split('/').slice(1).join('/').trim() || category.replace(/신부측|신랑측/g, '').trim() || '기타';
    guests.push({ id: guests.length + 1, name, side, group });
  }
  if (!guests.length) throw new Error('이름이 포함된 명단을 찾지 못했어요.');
  return guests;
}

export default function Home() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [tables, setTables] = useState<TableState[]>(emptyTables);
  const [tableOrder, setTableOrder] = useState<number[]>(() => [...DEFAULT_TABLE_ORDER]);
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState('');
  const [sideFilter, setSideFilter] = useState<SideFilter>('전체');
  const [groupFilter, setGroupFilter] = useState('전체 그룹');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [editingGuestId, setEditingGuestId] = useState<number | null>(null);
  const [targetSeat, setTargetSeat] = useState<SeatTarget | null>(null);
  const [seatQuery, setSeatQuery] = useState('');
  const [swapSource, setSwapSource] = useState<number | null>(null);
  const [hallSide, setHallSide] = useState<HallSide>('bride');
  const [notice, setNotice] = useState('테이블을 고르고 이름을 누르면 바로 배정돼요.');
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState('공동 배치를 불러오는 중…');
  const [retryNonce, setRetryNonce] = useState(0);
  const cloudVersionRef = useRef(0);
  const savedSnapshotRef = useRef('');
  const saveTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let localState: SharedState | null = null;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) localState = normalizeSavedState(JSON.parse(saved));
      } catch {}

      try {
        const response = await fetch('/api/seating', { cache: 'no-store' });
        if (!response.ok) throw new Error('shared storage unavailable');
        const shared = await response.json() as { state: unknown; version: number };
        const sharedState = normalizeSavedState(shared.state);
        if (sharedState) {
          if (!cancelled) {
            const snapshot = JSON.stringify(sharedState);
            cloudVersionRef.current = shared.version;
            savedSnapshotRef.current = snapshot;
            localStorage.setItem(STORAGE_KEY, snapshot);
            setGuests(sharedState.guests);
            setTables(sharedState.tables);
            setTableOrder(sharedState.tableOrder);
            setSyncStatus('모든 기기에 저장됨');
            setReady(true);
          }
          return;
        }
      } catch {}

      const fallback = localState ?? {
        guests: parseCompactRoster(await fetch('/roster.txt').then((response) => response.text())),
        tables: emptyTables(),
        tableOrder: [...DEFAULT_TABLE_ORDER],
      };
      if (!cancelled) {
        savedSnapshotRef.current = '';
        setGuests(fallback.guests);
        setTables(fallback.tables);
        setTableOrder(fallback.tableOrder);
        setSyncStatus('공동 저장 준비 중…');
        setReady(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !guests.length) return;
    const snapshot = JSON.stringify({ guests, tables, tableOrder });
    localStorage.setItem(STORAGE_KEY, snapshot);
    if (snapshot === savedSnapshotRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setSyncStatus('공동 저장 중…');
    saveTimerRef.current = window.setTimeout(async () => {
      savingRef.current = true;
      saveTimerRef.current = null;
      try {
        const response = await fetch('/api/seating', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: { guests, tables, tableOrder } }),
        });
        if (!response.ok) throw new Error('save failed');
        const result = await response.json() as { version: number };
        cloudVersionRef.current = result.version;
        savedSnapshotRef.current = snapshot;
        setSyncStatus('모든 기기에 저장됨');
      } catch {
        setSyncStatus('연결 확인 중…');
        saveTimerRef.current = window.setTimeout(() => setRetryNonce((value) => value + 1), 3000);
      } finally {
        savingRef.current = false;
      }
    }, 650);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [guests, tables, tableOrder, ready, retryNonce]);

  useEffect(() => {
    if (!ready) return;
    const interval = window.setInterval(async () => {
      if (savingRef.current || saveTimerRef.current) return;
      const currentSnapshot = JSON.stringify({ guests, tables, tableOrder });
      if (currentSnapshot !== savedSnapshotRef.current) return;
      try {
        const response = await fetch('/api/seating', { cache: 'no-store' });
        if (!response.ok) return;
        const shared = await response.json() as { state: unknown; version: number };
        if (shared.version <= cloudVersionRef.current) return;
        const sharedState = normalizeSavedState(shared.state);
        if (!sharedState) return;
        const snapshot = JSON.stringify(sharedState);
        cloudVersionRef.current = shared.version;
        savedSnapshotRef.current = snapshot;
        localStorage.setItem(STORAGE_KEY, snapshot);
        setGuests(sharedState.guests);
        setTables(sharedState.tables);
        setTableOrder(sharedState.tableOrder);
        setSyncStatus('상대방의 최신 배치를 반영했어요');
      } catch {}
    }, 4000);
    return () => window.clearInterval(interval);
  }, [guests, tables, tableOrder, ready]);

  const assignments = useMemo(() => {
    const map = new Map<number, { table: number; seat: number }>();
    tables.forEach((table, tableIndex) => table.seats.forEach((id, seatIndex) => {
      if (id !== null) map.set(id, { table: tableIndex, seat: seatIndex });
    }));
    return map;
  }, [tables]);

  const groups = useMemo(() => ['전체 그룹', ...Array.from(new Set(guests.map((guest) => guest.group)))], [guests]);
  const visibleGuests = useMemo(() => guests.filter((guest) => {
    const assigned = assignments.has(guest.id);
    const matchesSide = sideFilter === '전체' || (sideFilter === '미배정' ? !assigned : guest.side === sideFilter);
    const matchesGroup = groupFilter === '전체 그룹' || guest.group === groupFilter;
    const haystack = `${guest.name} ${guest.side} ${guest.group}`.toLowerCase();
    return matchesSide && matchesGroup && haystack.includes(query.trim().toLowerCase());
  }).sort((a, b) => Number(assignments.has(a.id)) - Number(assignments.has(b.id))), [assignments, groupFilter, guests, query, sideFilter]);

  const selectedTable = tables[selected];
  const brideTableOrder = tableOrder.filter((index) => tableSection(index) === 'bride');
  const groomTableOrder = tableOrder.filter((index) => tableSection(index) === 'groom');
  const annexTableOrder = tableOrder.filter((index) => tableSection(index) === 'annex');
  const editingGuest = editingGuestId === null ? null : guests.find((guest) => guest.id === editingGuestId) ?? null;
  const editingAssignment = editingGuest ? assignments.get(editingGuest.id) : undefined;
  const seatPickerGuests = useMemo(() => guests.filter((guest) => {
    if (assignments.has(guest.id) || guest.id === targetSeat?.excludeGuestId) return false;
    return `${guest.name} ${guest.side} ${guest.group}`.toLowerCase().includes(seatQuery.trim().toLowerCase());
  }), [assignments, guests, seatQuery, targetSeat]);

  function chooseGuest(guest: Guest) {
    const current = assignments.get(guest.id);
    setTables((previous) => {
      const next = previous.map((table) => ({ ...table, seats: [...table.seats] }));
      if (current?.table === selected) {
        next[selected].seats[current.seat] = null;
        setNotice(`${guest.name} 님의 ${selected + 1}번 테이블 배정을 해제했어요.`);
        return next;
      }
      const openSeat = next[selected].seats.slice(0, next[selected].capacity).findIndex((id) => id === null);
      if (openSeat < 0) { setNotice(`${selected + 1}번 테이블이 가득 찼어요.`); return previous; }
      if (current) next[current.table].seats[current.seat] = null;
      next[selected].seats[openSeat] = guest.id;
      setNotice(`${guest.name} 님을 ${selected + 1}번 테이블 ${openSeat + 1}번 좌석에 배정했어요.`);
      return next;
    });
  }

  function openAssignmentEditor(guest: Guest, tableIndex: number) {
    setSelected(tableIndex);
    setEditingGuestId(guest.id);
  }

  function clearEditingGuest(replace: boolean) {
    if (!editingGuest || !editingAssignment) return;
    const seat = { tableIndex: editingAssignment.table, seatIndex: editingAssignment.seat, excludeGuestId: editingGuest.id };
    setTables((previous) => previous.map((table, tableIndex) => ({
      ...table,
      seats: table.seats.map((id) => tableIndex === editingAssignment.table && id === editingGuest.id ? null : id),
    })));
    setNotice(replace
      ? `${editingGuest.name} 님을 해제했어요. 같은 자리에 넣을 하객을 선택하세요.`
      : `${editingGuest.name} 님의 ${editingAssignment.table + 1}번 테이블 배정을 해제했어요.`);
    setEditingGuestId(null);
    if (replace) {
      setTargetSeat(seat);
      setSeatQuery('');
    }
  }

  function openSeatPicker(tableIndex: number, seatIndex: number) {
    setSelected(tableIndex);
    setTargetSeat({ tableIndex, seatIndex });
    setSeatQuery('');
  }

  function assignGuestToTargetSeat(guest: Guest) {
    if (!targetSeat || assignments.has(guest.id)) return;
    const { tableIndex, seatIndex } = targetSeat;
    setTables((previous) => {
      if (previous[tableIndex].seats[seatIndex] !== null) {
        setNotice('방금 다른 기기에서 이 자리가 배정됐어요. 다른 빈자리를 선택해 주세요.');
        return previous;
      }
      return previous.map((table, index) => index === tableIndex
        ? { ...table, seats: table.seats.map((id, indexInTable) => indexInTable === seatIndex ? guest.id : id) }
        : table);
    });
    setNotice(`${guest.name} 님을 ${tableIndex + 1}번 테이블 ${seatIndex + 1}번 좌석에 배정했어요.`);
    setTargetSeat(null);
    setSeatQuery('');
  }

  function setCapacity(capacity: 8 | 9 | 10) {
    if (selectedTable.seats.slice(capacity).some((id) => id !== null)) { setNotice('줄어드는 좌석에 배정된 이름을 먼저 빼주세요.'); return; }
    setTables((previous) => previous.map((table, index) => index === selected ? { ...table, capacity } : table));
  }

  function toggleSwapMode() {
    if (swapSource !== null) {
      setSwapSource(null);
      setNotice('테이블 위치 바꾸기를 취소했어요.');
      return;
    }
    setSwapSource(selected);
    setNotice(`${selected + 1}번 테이블과 위치를 바꿀 테이블을 배치도에서 누르세요.`);
  }

  function selectOrSwapTable(index: number) {
    if (swapSource === null) {
      setSelected(index);
      setNotice(`${index + 1}번 테이블을 선택했어요. 이름을 눌러 배정하세요.`);
      return;
    }
    if (index === swapSource) {
      setSwapSource(null);
      setNotice('테이블 위치 바꾸기를 취소했어요.');
      return;
    }
    if (tableSection(index) !== tableSection(swapSource)) {
      setNotice('같은 홀 안에 있는 테이블끼리 위치를 바꿀 수 있어요.');
      return;
    }
    setTableOrder((previous) => {
      const next = [...previous];
      const sourcePosition = next.indexOf(swapSource);
      const targetPosition = next.indexOf(index);
      [next[sourcePosition], next[targetPosition]] = [next[targetPosition], next[sourcePosition]];
      return next;
    });
    setNotice(`${swapSource + 1}번과 ${index + 1}번 테이블의 위치를 바꿨어요.`);
    setSwapSource(null);
  }

  function switchHall(next: HallSide) {
    setSwapSource(null);
    setHallSide(next);
    if (next === 'bride' && selected >= 10 && selected < 19) setSelected(0);
    if (next === 'groom' && (selected < 10 || selected >= 19)) setSelected(10);
    setNotice(next === 'bride'
      ? '신부측 1–10번·20번 테이블과 별도 홀 21–23번을 보고 있어요.'
      : '신랑측 11–19번 테이블을 보고 있어요.');
  }

  function applyPastedRoster() {
    try {
      const nextGuests = parsePastedRoster(pasteText);
      setGuests(nextGuests); setTables(emptyTables()); setSelected(0); setQuery(''); setSideFilter('전체'); setGroupFilter('전체 그룹'); setPasteOpen(false); setPasteText('');
      setNotice(`${nextGuests.length}명의 새 명단을 적용했어요.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : '명단을 읽지 못했어요.'); }
  }

  function resetSeating() {
    if (!window.confirm('모든 좌석 배정을 비울까요? 명단은 유지됩니다.')) return;
    setTables(emptyTables()); setNotice('모든 좌석을 비웠어요.');
  }

  function renderTable(table: TableState, index: number, position: number[]) {
    const count = table.seats.filter((id) => id !== null).length;
    const tableTone = index < 10 || index === 19 ? 'bride' : index < 19 ? 'groom' : 'annex';
    const canSwapHere = swapSource !== null && tableSection(swapSource) === tableSection(index);
    return <div key={index} className={`table-cluster ${tableTone} ${swapSource === index ? 'swap-source' : canSwapHere ? 'swap-target' : ''}`} style={{ left: `${position[0]}%`, top: `${position[1]}%` }}>
      {table.seats.slice(0, table.capacity).map((id, seatIndex) => {
        const guest = guests.find((person) => person.id === id);
        const angle = (-90 + seatIndex * 360 / table.capacity) * Math.PI / 180;
        const x = Math.cos(angle) * 78;
        const y = Math.sin(angle) * 78;
        return guest
          ? <button key={seatIndex} className={`table-seat-name ${guest.side === '신부측' ? 'bride' : 'groom'}`} style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }} title={`${guest.name} 님 교체 또는 배정 해제`} onClick={() => openAssignmentEditor(guest, index)}>{guest.name}</button>
          : <button key={seatIndex} className="empty-seat-dot" style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }} onClick={() => openSeatPicker(index, seatIndex)} aria-label={`${index + 1}번 테이블 ${seatIndex + 1}번 빈자리 배정`} title="이 자리에 하객 배정">+</button>;
      })}
      <button className={`round-table ${selected === index ? 'selected' : ''} ${count === table.capacity ? 'full' : ''}`} onClick={() => selectOrSwapTable(index)} aria-pressed={selected === index} aria-label={`${index + 1}번 테이블, ${count}명 배정${canSwapHere && index !== swapSource ? ', 위치 바꾸기 대상' : ''}`}><b>{index + 1}</b><small>{count} / {table.capacity}</small></button>
    </div>;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="맨 위로"><img className="brand-logo" src="/logo-ngrl.png" alt="너굴릴라 로고" /><strong>너굴릴라 웨딩 자리배치도</strong></a>
        <div className="top-actions"><span className="sync-status" aria-live="polite"><i />{syncStatus}</span><button className="ghost-button" onClick={resetSeating}>배정 초기화</button><button className="primary-button" onClick={() => setPasteOpen(true)}>명단 붙여넣기</button></div>
      </header>

      <section className="summary" id="top" aria-label="배치 현황">
        <div><span>전체 하객</span><strong>{guests.length}<small>명</small></strong></div><div><span>배정 완료</span><strong>{assignments.size}<small>명</small></strong></div><div><span>남은 하객</span><strong>{guests.length - assignments.size}<small>명</small></strong></div><div><span>전체 좌석</span><strong>{tables.reduce((sum, table) => sum + table.capacity, 0)}<small>석</small></strong></div>
      </section>

      <p className="notice" role="status"><span>●</span>{notice}</p>
      <section className="workspace">
        <div className="floor-card card">
          <div className="card-heading"><div><h2>웨딩홀 배치도</h2><p>{hallSide === 'bride' ? '신부측 1–10번·20번 · 별도 홀 21–23번' : '신랑측 11–19번'} · 테이블당 8–10석</p></div><div className="hall-tabs" role="tablist" aria-label="홀 구역 선택"><button role="tab" aria-selected={hallSide === 'bride'} className={hallSide === 'bride' ? 'active bride' : ''} onClick={() => switchHall('bride')}>🦝 신부측</button><button role="tab" aria-selected={hallSide === 'groom'} className={hallSide === 'groom' ? 'active groom' : ''} onClick={() => switchHall('groom')}>🦍 신랑측</button></div></div>
          <div className="hall-wrap">
            <div className={`hall side-hall ${hallSide}`}>
              <div className="stage"><b>STAGE</b><span>{hallSide === 'bride' ? '신부측 · 1–10번 / 20번' : '신랑측 · 11–19번'}</span></div>
              <span className={`mascot-label side-mascot ${hallSide === 'bride' ? 'bride-mascot' : 'groom-mascot'}`}><b>{hallSide === 'bride' ? '🦝' : '🦍'}</b><small>{hallSide === 'bride' ? '신부측' : '신랑측'}</small></span>
              {(hallSide === 'bride' ? brideTableOrder : groomTableOrder).map((index, offset) => {
                const table = tables[index];
                const position = hallSide === 'bride' ? BRIDE_TABLE_POSITIONS[offset] : GROOM_TABLE_POSITIONS[offset];
                return renderTable(table, index, position);
              })}
              <span className="entrance">↖ ENTRANCE</span>
            </div>
            {hallSide === 'bride' && <section className="annex-section" aria-label="별도 홀">
              <div className="annex-heading"><h3>별도 홀</h3><span>21–23번 테이블</span></div>
              <div className="annex-hall">
                {annexTableOrder.map((index, offset) => renderTable(tables[index], index, ANNEX_TABLE_POSITIONS[offset]))}
              </div>
            </section>}
          </div>
        </div>

        <aside className="guest-card card">
          <div className="guest-sticky">
            <div className="table-editor-head"><div><span className="section-label">선택한 테이블</span><h2>{String(selected + 1).padStart(2, '0')}번 테이블</h2></div><div className="table-editor-controls"><button className={`swap-table-button ${swapSource !== null ? 'active' : ''}`} onClick={toggleSwapMode}>{swapSource !== null ? '바꾸기 취소' : '위치 바꾸기'}</button><div className="capacity-picker" aria-label="테이블 좌석 수">{([8, 9, 10] as const).map((capacity) => <button key={capacity} className={selectedTable.capacity === capacity ? 'active' : ''} onClick={() => setCapacity(capacity)}>{capacity}</button>)}</div></div></div>
            <div className="list-title"><div><h2>전체 하객 명단</h2><p>이름을 누르면 선택한 테이블에 바로 배정됩니다.</p></div><strong>{visibleGuests.length}명</strong></div>
            <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 관계 검색" aria-label="하객 검색" /></label>
            <div className="filters">{(['전체', '신부측', '신랑측', '미배정'] as SideFilter[]).map((filter) => <button key={filter} className={sideFilter === filter ? 'active' : ''} onClick={() => setSideFilter(filter)}>{filter}</button>)}<select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} aria-label="관계 그룹 필터">{groups.map((group) => <option key={group}>{group}</option>)}</select></div>
          </div>
          <div className="guest-list">
            {!ready && <p className="empty-state">명단을 불러오는 중이에요…</p>}{ready && !visibleGuests.length && <p className="empty-state">조건에 맞는 이름이 없어요.</p>}
            {visibleGuests.map((guest) => { const assigned = assignments.get(guest.id); const here = assigned?.table === selected; return <button key={guest.id} className={`guest-row ${here ? 'here' : ''}`} onClick={() => chooseGuest(guest)}><span className={`avatar ${guest.side === '신랑측' ? 'groom' : ''}`}>{guest.name.slice(0, 1)}</span><span className="guest-name"><strong>{guest.name}</strong><small>{guest.side} · {guest.group}</small></span><span className={`assignment ${assigned ? 'assigned' : ''}`}>{assigned ? `${assigned.table + 1}번 · ${assigned.seat + 1}석` : '+ 배정'}</span></button>; })}
          </div>
        </aside>
      </section>

      {editingGuest && editingAssignment && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setEditingGuestId(null)}><section className="assignment-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-title"><button className="modal-close" onClick={() => setEditingGuestId(null)} aria-label="닫기">×</button><span className={`assignment-avatar ${editingGuest.side === '신랑측' ? 'groom' : ''}`}>{editingGuest.name.slice(0, 1)}</span><h2 id="assignment-title">{editingGuest.name}</h2><p>현재 {editingAssignment.table + 1}번 테이블 · {editingAssignment.seat + 1}번 좌석</p><div className="assignment-actions"><button className="remove-button" onClick={() => clearEditingGuest(false)}>배정 해제</button><button className="primary-button" onClick={() => clearEditingGuest(true)}>다른 사람으로 교체</button></div></section></div>}
      {targetSeat && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setTargetSeat(null)}><section className="seat-picker-modal" role="dialog" aria-modal="true" aria-labelledby="seat-picker-title"><button className="modal-close" onClick={() => setTargetSeat(null)} aria-label="닫기">×</button><span className="section-label">빈자리에 바로 배정</span><h2 id="seat-picker-title">{targetSeat.tableIndex + 1}번 테이블 · {targetSeat.seatIndex + 1}번 자리</h2><p>배정할 하객을 선택하세요. 이미 배정된 사람은 표시되지 않습니다.</p><label className="seat-picker-search"><span>⌕</span><input value={seatQuery} onChange={(event) => setSeatQuery(event.target.value)} placeholder="이름 또는 관계 검색" aria-label="배정할 하객 검색" autoFocus /></label><div className="seat-picker-list">{!seatPickerGuests.length && <p className="empty-state">조건에 맞는 미배정 하객이 없어요.</p>}{seatPickerGuests.map((guest) => <button key={guest.id} className="seat-picker-row" onClick={() => assignGuestToTargetSeat(guest)}><span className={`avatar ${guest.side === '신랑측' ? 'groom' : ''}`}>{guest.name.slice(0, 1)}</span><span className="guest-name"><strong>{guest.name}</strong><small>{guest.side} · {guest.group}</small></span><span>이 자리에 배정</span></button>)}</div></section></div>}
      {pasteOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setPasteOpen(false)}><section className="paste-modal" role="dialog" aria-modal="true" aria-labelledby="paste-title"><button className="modal-close" onClick={() => setPasteOpen(false)} aria-label="닫기">×</button><h2 id="paste-title">표를 그대로 붙여넣으세요</h2><p>엑셀이나 구글 시트의 ‘이름 · 구분’ 열을 복사해서 아래 칸에 붙여넣으면 됩니다.</p><textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={'이름\t구분\n홍길동\t신부측 / 친구\n김하나\t신랑측 / 회사 동료'} autoFocus /><div className="modal-actions"><button className="ghost-button" onClick={() => setPasteOpen(false)}>취소</button><button className="primary-button" onClick={applyPastedRoster} disabled={!pasteText.trim()}>새 명단 적용</button></div></section></div>}
    </main>
  );
}

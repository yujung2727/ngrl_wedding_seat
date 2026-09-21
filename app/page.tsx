'use client';

import { useEffect, useMemo, useState } from 'react';

type Guest = { id: number; name: string; side: '신부측' | '신랑측'; group: string };
type TableState = { capacity: 8 | 9 | 10; seats: Array<number | null> };
type SideFilter = '전체' | '신부측' | '신랑측' | '미배정';

const STORAGE_KEY = 'our-seats-v1';
const GROUPS = [
  '회사 동료2', '회사 동료1', '서울대 과', '도비 지인', '추가 지인', '오솔 지인',
  '고등학교', '중학교', '대학선배', '대학동기', '해병대', '대학원', '서울대',
  '친척', '친구', '직계', '외가', '친가', '동기', '룸메',
];

const TABLE_POSITIONS = [
  [24, 12], [20, 21], [25, 30], [20, 39], [24, 48], [20, 57], [25, 66], [20, 75], [25, 84], [20, 93],
  [76, 12], [80, 21], [75, 30], [80, 39], [76, 48], [80, 57], [75, 66], [80, 75], [75, 84], [80, 93],
];
const ANNEX_TABLE_POSITIONS = [[20, 50], [50, 50], [80, 50]];

function emptyTables(): TableState[] {
  return Array.from({ length: 23 }, () => ({ capacity: 10, seats: Array(10).fill(null) }));
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
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState('');
  const [sideFilter, setSideFilter] = useState<SideFilter>('전체');
  const [groupFilter, setGroupFilter] = useState('전체 그룹');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [notice, setNotice] = useState('테이블을 고르고 이름을 누르면 바로 배정돼요.');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as { guests: Guest[]; tables: TableState[] };
          if (parsed.guests?.length && (parsed.tables?.length === 20 || parsed.tables?.length === 23)) {
            const migratedTables = parsed.tables.length === 20
              ? [...parsed.tables, ...emptyTables().slice(20)]
              : parsed.tables;
            if (!cancelled) { setGuests(parsed.guests); setTables(migratedTables); setReady(true); }
            return;
          }
        }
      } catch {}
      const raw = await fetch('/roster.txt').then((response) => response.text());
      if (!cancelled) { setGuests(parseCompactRoster(raw)); setReady(true); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !guests.length) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ guests, tables }));
  }, [guests, tables, ready]);

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
  }), [assignments, groupFilter, guests, query, sideFilter]);

  const selectedTable = tables[selected];

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

  function setCapacity(capacity: 8 | 9 | 10) {
    if (selectedTable.seats.slice(capacity).some((id) => id !== null)) { setNotice('줄어드는 좌석에 배정된 이름을 먼저 빼주세요.'); return; }
    setTables((previous) => previous.map((table, index) => index === selected ? { ...table, capacity } : table));
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
    const tableTone = index < 10 ? 'bride' : index < 20 ? 'groom' : 'annex';
    return <div key={index} className={`table-cluster ${tableTone}`} style={{ left: `${position[0]}%`, top: `${position[1]}%` }}>
      {table.seats.slice(0, table.capacity).map((id, seatIndex) => {
        const guest = guests.find((person) => person.id === id);
        const angle = (-90 + seatIndex * 360 / table.capacity) * Math.PI / 180;
        const x = Math.cos(angle) * 78;
        const y = Math.sin(angle) * 78;
        return guest
          ? <span key={seatIndex} className={`table-seat-name ${guest.side === '신부측' ? 'bride' : 'groom'}`} style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }} title={`${seatIndex + 1}번 좌석 · ${guest.name}`}>{guest.name}</span>
          : <i key={seatIndex} className="empty-seat-dot" style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }} />;
      })}
      <button className={`round-table ${selected === index ? 'selected' : ''} ${count === table.capacity ? 'full' : ''}`} onClick={() => { setSelected(index); setNotice(`${index + 1}번 테이블을 선택했어요. 이름을 눌러 배정하세요.`); }} aria-pressed={selected === index} aria-label={`${index + 1}번 테이블, ${count}명 배정`}><b>{index + 1}</b><small>{count} / {table.capacity}</small></button>
    </div>;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="맨 위로"><img className="brand-logo" src="/logo-ngrl.png" alt="너굴릴라 로고" /><strong>너굴릴라 웨딩 자리배치도</strong></a>
        <div className="top-actions"><button className="ghost-button" onClick={resetSeating}>배정 초기화</button><button className="primary-button" onClick={() => setPasteOpen(true)}>명단 붙여넣기</button></div>
      </header>

      <section className="summary" id="top" aria-label="배치 현황">
        <div><span>전체 하객</span><strong>{guests.length}<small>명</small></strong></div><div><span>배정 완료</span><strong>{assignments.size}<small>명</small></strong></div><div><span>남은 하객</span><strong>{guests.length - assignments.size}<small>명</small></strong></div><div><span>전체 좌석</span><strong>{tables.reduce((sum, table) => sum + table.capacity, 0)}<small>석</small></strong></div>
      </section>

      <p className="notice" role="status"><span>●</span>{notice}</p>
      <section className="workspace">
        <div className="floor-card card">
          <div className="card-heading"><div><h2>웨딩홀 배치도</h2><p>메인 홀 20개 · 별도 홀 3개 · 테이블당 8–10석</p></div><span className="selected-legend"><i /> 선택한 테이블</span></div>
          <div className="hall-wrap">
            <div className="hall main-hall">
              <div className="stage"><b>STAGE</b><span>신랑 · 신부</span></div>
              <span className="mascot-label bride-mascot"><b>🦝</b><small>신부측</small></span>
              <span className="mascot-label groom-mascot"><b>🦍</b><small>신랑측</small></span>
              <div className="virgin-road"><span>VIRGIN ROAD</span></div>
              {tables.slice(0, 20).map((table, index) => renderTable(table, index, TABLE_POSITIONS[index]))}
              <span className="entrance">↖ ENTRANCE</span>
            </div>
            <section className="annex-section" aria-label="별도 홀">
              <div className="annex-heading"><h3>별도 홀</h3><span>21–23번 테이블</span></div>
              <div className="annex-hall">
                {tables.slice(20, 23).map((table, offset) => renderTable(table, offset + 20, ANNEX_TABLE_POSITIONS[offset]))}
              </div>
            </section>
          </div>
        </div>

        <aside className="guest-card card">
          <div className="guest-sticky">
            <div className="table-editor-head"><div><span className="section-label">선택한 테이블</span><h2>{String(selected + 1).padStart(2, '0')}번 테이블</h2></div><div className="capacity-picker" aria-label="테이블 좌석 수">{([8, 9, 10] as const).map((capacity) => <button key={capacity} className={selectedTable.capacity === capacity ? 'active' : ''} onClick={() => setCapacity(capacity)}>{capacity}</button>)}</div></div>
            <div className="seat-strip">{selectedTable.seats.slice(0, selectedTable.capacity).map((id, index) => { const guest = guests.find((person) => person.id === id); return <button key={index} className={guest ? 'occupied' : ''} onClick={() => guest && chooseGuest(guest)} title={guest ? '눌러서 배정 해제' : '빈 좌석'}><small>{index + 1}</small><span>{guest?.name || '빈자리'}</span></button>; })}</div>
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

      {pasteOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setPasteOpen(false)}><section className="paste-modal" role="dialog" aria-modal="true" aria-labelledby="paste-title"><button className="modal-close" onClick={() => setPasteOpen(false)} aria-label="닫기">×</button><h2 id="paste-title">표를 그대로 붙여넣으세요</h2><p>엑셀이나 구글 시트의 ‘이름 · 구분’ 열을 복사해서 아래 칸에 붙여넣으면 됩니다.</p><textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={'이름\t구분\n홍길동\t신부측 / 친구\n김하나\t신랑측 / 회사 동료'} autoFocus /><div className="modal-actions"><button className="ghost-button" onClick={() => setPasteOpen(false)}>취소</button><button className="primary-button" onClick={applyPastedRoster} disabled={!pasteText.trim()}>새 명단 적용</button></div></section></div>}
    </main>
  );
}

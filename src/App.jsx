import { useState, useEffect, useMemo, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Building2,
  FlaskConical,
  Route,
  Loader2,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  Send,
  ClipboardList,
  CheckCircle,
  XCircle,
  Factory,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MapPin,
  Filter,
  BarChart3,
  Calendar,
  Stethoscope,
  Menu,
  X,
  LayoutDashboard,
  DollarSign,
  Users,
  TrendingUp,
  Activity,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Login from './Login';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getToken() {
  return localStorage.getItem('token');
}

function authFetch(url) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(val) {
  if (val == null) return '$0.00';
  return '$' + Number(val).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ status }) {
  const colors = {
    Enviado: 'badge-blue',
    Solicitado: 'badge-yellow',
    Recibido: 'badge-green',
    Cancelado: 'badge-red',
  };
  return (
    <span className={`badge ${colors[status] || 'badge-gray'}`}>{status}</span>
  );
}

function UrgenciaBadge({ urgencia }) {
  if (!urgencia || urgencia === 'Normal') return <span>{urgencia || '—'}</span>;
  return <span className="badge badge-red">{urgencia}</span>;
}

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div className={`summary-card ${color}`}>
      <div className="card-icon">
        <Icon size={24} />
      </div>
      <div className="card-info">
        <span className="card-value">{value}</span>
        <span className="card-label">{label}</span>
      </div>
    </div>
  );
}

const PAGE_SIZE = 100;

// Report display names and icons
const REPORT_CONFIG = {
  'dashboard': { name: 'Dashboard', icon: LayoutDashboard },
  'indicadores-daily': { name: 'Indicadores Diario', icon: Calendar },
  'indicadores-monthly': { name: 'Indicadores Mensual', icon: BarChart3 },
  'medicos': { name: 'Reporte de Médicos', icon: Stethoscope },
  'maquilas': { name: 'Reporte de Maquilas', icon: Factory },
};

// ─── Multi-select component ────────────────────────────────────────
function MultiSearchSelect({ label, icon: Icon, options, selected, onChange, getLabel, getValue, allLabel = 'Todos' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
    if (!open) setSearch('');
  }, [open]);

  const filtered = options.filter(opt =>
    getLabel(opt).toLowerCase().includes(search.toLowerCase())
  );

  const allSelected = options.length > 0 && selected.length === options.length;

  const toggleAll = () => {
    if (allSelected) onChange([]);
    else onChange(options.map(getValue));
  };

  const toggle = (val) => {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const displayLabel = selected.length === 0
    ? 'Seleccionar...'
    : allSelected
      ? allLabel
      : selected.length === 1
        ? getLabel(options.find(opt => getValue(opt) === selected[0]) || '')
        : `${selected.length} seleccionados`;

  return (
    <div className="multi-select" ref={ref}>
      <label><Icon size={14} /> {label}</label>
      <button className="multi-select-btn" onClick={() => setOpen(!open)}>
        <span className="select-btn-text">{displayLabel}</span>
        <Filter size={14} />
      </button>
      {open && (
        <div className="multi-select-dropdown">
          <div className="select-search-wrap">
            <Search size={14} className="select-search-icon" />
            <input
              ref={inputRef}
              type="text"
              className="select-search-input"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="multi-select-option">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span>{allLabel}</span>
          </label>
          {filtered.map(opt => {
            const val = getValue(opt);
            const checked = selected.includes(val);
            return (
              <label key={val} className="multi-select-option">
                <input type="checkbox" checked={checked} onChange={() => toggle(val)} />
                <span>{getLabel(opt)}</span>
              </label>
            );
          })}
          {filtered.length === 0 && (
            <div className="multi-select-option empty">Sin resultados</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Generic Table with pagination ──────────────────────────────────
function DataTable({ data, columns, loading, globalFilter, setGlobalFilter }) {
  const [sorting, setSorting] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [isSticky, setIsSticky] = useState(false);
  const sentinelRef = useRef(null);

  useEffect(() => { setPageIndex(0); }, [data, globalFilter]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsSticky(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, sorting, pagination: { pageIndex, pageSize: PAGE_SIZE } },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function'
        ? updater({ pageIndex, pageSize: PAGE_SIZE })
        : updater;
      setPageIndex(next.pageIndex);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <>
      <div ref={sentinelRef} className="table-sentinel" />
      <section className="table-container desktop-only">
        <table>
          <thead className={isSticky ? 'stuck' : ''}>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="sortable"
                  >
                    <div className="th-content">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: <ArrowUp size={14} />,
                        desc: <ArrowDown size={14} />,
                      }[header.column.getIsSorted()] ?? <ArrowUpDown size={14} className="sort-idle" />}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="empty-state">
                  {loading ? 'Cargando...' : 'Sin resultados'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={row.original._isTotal ? 'row-total' : ''}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Mobile cards */}
      <section className="mobile-cards mobile-only">
        {table.getRowModel().rows.length === 0 ? (
          <div className="empty-state">{loading ? 'Cargando...' : 'Sin resultados'}</div>
        ) : (
          table.getRowModel().rows.map((row) => (
            <div key={row.id} className="mobile-card">
              <div className="mobile-card-body">
                {row.getVisibleCells().map((cell) => (
                  <div key={cell.id} className="mobile-card-row">
                    <span className="mobile-card-label">{cell.column.columnDef.header}</span>
                    <span>{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <footer className="pagination-footer">
        <span className="pagination-info">
          {table.getFilteredRowModel().rows.length} registros
          {table.getPageCount() > 1 && (
            <> — Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}</>
          )}
        </span>
        {table.getPageCount() > 1 && (
          <div className="pagination-controls">
            <button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} className="pagination-btn">
              <ChevronsLeft size={16} />
            </button>
            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="pagination-btn">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="pagination-btn">
              <ChevronRight size={16} />
            </button>
            <button onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()} className="pagination-btn">
              <ChevronsRight size={16} />
            </button>
          </div>
        )}
      </footer>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAQUILAS REPORT (existing report, for "usuario" role)
// ═══════════════════════════════════════════════════════════════════

const maquilasColumns = [
  { accessorKey: 'Sucursal', header: 'Sucursal' },
  { accessorKey: 'Solicitud', header: 'Solicitud' },
  { accessorKey: 'NombrePaciente', header: 'Paciente' },
  { accessorKey: 'Medico', header: 'Médico' },
  { accessorKey: 'ClaveEstudio', header: 'Clave Estudio' },
  { accessorKey: 'NombreEstudio', header: 'Nombre Estudio' },
  { accessorKey: 'Estatus', header: 'Estatus', cell: ({ getValue }) => <StatusBadge status={getValue()} /> },
  { accessorKey: 'Ruta', header: 'Ruta' },
  { accessorKey: 'Maquilador', header: 'Maquilador' },
  { accessorKey: 'Urgencia', header: 'Urgencia', cell: ({ getValue }) => <UrgenciaBadge urgencia={getValue()} /> },
  { accessorKey: 'FechaEntrega', header: 'Fecha Entrega', cell: ({ getValue }) => formatDate(getValue()) },
];

function exportMaquilasCSV(data) {
  if (!data.length) return;
  const headers = ['Sucursal','Solicitud','Nombre Paciente','Medico','Clave Estudio','Nombre Estudio','Estatus','Ruta','Maquilador','Urgencia','Fecha de Entrega'];
  const keys = ['Sucursal','Solicitud','NombrePaciente','Medico','ClaveEstudio','NombreEstudio','Estatus','Ruta','Maquilador','Urgencia','FechaEntrega'];
  const csv = [
    headers.join(','),
    ...data.map((row) => keys.map((k) => `"${(row[k] ?? '').toString().replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte_maquilas_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportMaquilasExcel(data) {
  if (!data.length) return;
  const headers = ['Sucursal','Solicitud','Nombre Paciente','Médico','Clave Estudio','Nombre Estudio','Estatus','Ruta','Maquilador','Urgencia','Fecha de Entrega'];
  const keys = ['Sucursal','Solicitud','NombrePaciente','Medico','ClaveEstudio','NombreEstudio','Estatus','Ruta','Maquilador','Urgencia','FechaEntrega'];
  const rows = data.map((row) =>
    keys.reduce((acc, key, i) => {
      acc[headers[i]] = key === 'FechaEntrega' ? formatDate(row[key]) : (row[key] ?? '');
      return acc;
    }, {})
  );
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 18) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte Maquilas');
  XLSX.writeFile(wb, `reporte_maquilas_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportMaquilasPDF(data, startDate, endDate) {
  if (!data.length) return;
  const m = 15;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const xEnd = pageW - m;
  const xSol = m;
  const xName = m + 20;
  const xStat = pageW - 85;
  const xDate = pageW - 52;

  const statusColors = {
    Enviado: [29, 78, 216], Solicitado: [180, 83, 9], Impreso: [100, 100, 100],
    Recibido: [4, 120, 87], Validado: [4, 120, 87], Cancelado: [220, 38, 38],
    'Toma de muestra': [120, 80, 0],
  };

  const groups = [];
  const seen = {};
  data.forEach(row => {
    const key = row.Solicitud;
    if (!seen[key]) {
      seen[key] = {
        Sucursal: row.Sucursal || '', Solicitud: key,
        NombrePaciente: row.NombrePaciente || '', Medico: row.Medico || '',
        Maquilador: row.Maquilador || '', Urgencia: row.Urgencia || 'Normal', estudios: [],
      };
      groups.push(seen[key]);
    }
    seen[key].estudios.push({ Clave: row.ClaveEstudio, Nombre: row.NombreEstudio, Estatus: row.Estatus, FechaEntrega: row.FechaEntrega });
  });

  const maxY = pageH - 20;
  function colHeaders(y) {
    doc.setDrawColor(0); doc.setLineWidth(0.3); doc.line(m, y, xEnd, y);
    doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
    doc.text('Solicitud', xSol + 2, y + 3.5); doc.text('Nombre del Paciente', xName, y + 3.5);
    doc.text('Status', xStat, y + 3.5); doc.text('Fecha de Entrega', xDate, y + 3.5, { align: 'left' });
    doc.line(m, y + 5.5, xEnd, y + 5.5);
    return y + 9;
  }
  function nextPage() { doc.addPage(); return colHeaders(m); }
  function need(y, h) { if (y + h > maxY) return nextPage(); return y; }
  function footer(pn, tp) {
    doc.setFontSize(6); doc.setTextColor(120); doc.setFont(undefined, 'normal');
    const ts = `${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
    doc.text(ts, m, pageH - 8); doc.text('Este informe no podrá ser reproducido total o parcialmente.', m, pageH - 4);
    doc.text(`Página ${pn}/${tp}`, xEnd, pageH - 8, { align: 'right' });
  }

  doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
  doc.text('Laboratorio Alfonso Ramos S.A de C.V.', pageW / 2, m + 4, { align: 'center' });
  doc.setFontSize(8); doc.setFont(undefined, 'normal');
  doc.text('RELACION DE ESTUDIOS CON MAQUILA POR PACIENTE', pageW / 2, m + 10, { align: 'center' });
  doc.setFontSize(7); doc.setTextColor(100);
  doc.text(`Fecha Inicio: ${startDate}    Fecha Fin: ${endDate}`, pageW / 2, m + 15, { align: 'center' });
  doc.setTextColor(0);

  let y = colHeaders(m + 19);
  let curSuc = '';

  for (const g of groups) {
    if (g.Sucursal !== curSuc) {
      curSuc = g.Sucursal;
      y = need(y, 10);
      doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(m, y, xEnd, y); y += 4;
      doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
      doc.text(`SUCURSAL: ${curSuc.toUpperCase()}`, m, y); y += 5;
    }
    const blockHeight = 10 + (g.estudios.length * 5);
    y = need(y, blockHeight);
    const showUrgente = g.Urgencia && g.Urgencia !== 'Normal';
    doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
    doc.text(g.Solicitud, xSol, y);
    doc.text(g.NombrePaciente.toUpperCase(), xName, y, { maxWidth: xStat - xName - 5 });
    doc.text(`Vigente  ${g.Maquilador}`, xDate, y); y += 5;
    doc.setFontSize(7); doc.setFont(undefined, 'bold');
    doc.text('MEDICO :', xSol, y); doc.setFont(undefined, 'normal');
    doc.text(g.Medico.toUpperCase(), xSol + 18, y); y += 5;
    if (showUrgente) {
      doc.setFontSize(7); doc.setFont(undefined, 'bold');
      const ut = g.Urgencia.toUpperCase(); const uw = doc.getTextWidth(ut) + 3;
      doc.setTextColor(220, 38, 38); doc.setDrawColor(220, 38, 38); doc.setLineWidth(0.3);
      doc.rect(xDate - 1, y - 3, uw, 4.5); doc.text(ut, xDate, y);
      doc.setDrawColor(0); doc.setTextColor(0); y += 5;
    }
    for (const est of g.estudios) {
      doc.setFontSize(7); doc.setFont(undefined, 'normal'); doc.setTextColor(0);
      doc.text(est.Clave || '', xSol + 8, y);
      doc.text(est.Nombre || '', xSol + 25, y, { maxWidth: xStat - xSol - 30 });
      const sc = statusColors[est.Estatus] || [0, 0, 0];
      doc.setTextColor(sc[0], sc[1], sc[2]); doc.text(est.Estatus || '', xStat, y); doc.setTextColor(0);
      const fd = est.FechaEntrega ? new Date(est.FechaEntrega).toISOString().slice(0, 10) : '';
      doc.text(fd, xDate, y); y += 5;
    }
    doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(m, y, xEnd, y); y += 3;
  }

  const tp = doc.getNumberOfPages();
  for (let i = 1; i <= tp; i++) { doc.setPage(i); footer(i, tp); }
  doc.save(`reporte_maquilas_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function MaquilasReport({ onLogout }) {
  const now = new Date();
  const [startDate, setStartDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString().slice(0, 10));
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [meta, setMeta] = useState({ ciudades: [], maquiladores: [] });
  const [selectedCiudades, setSelectedCiudades] = useState([]);
  const [selectedMaquiladores, setSelectedMaquiladores] = useState([]);

  useEffect(() => {
    authFetch(`${API_BASE}/api/reports/maquilas/meta`).then(r => r.json()).then(setMeta).catch(() => {});
  }, []);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        startDate: `${startDate}T00:00:00`,
        endDate: `${endDate}T23:59:59`,
      });
      if (selectedCiudades.length) params.set('ciudades', selectedCiudades.join(','));
      if (selectedMaquiladores.length) params.set('maquiladores', selectedMaquiladores.join(','));
      const res = await authFetch(`${API_BASE}/api/reports/maquilas?${params}`);
      if (res.status === 401) { onLogout(); return; }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setData(await res.json());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const summary = useMemo(() => {
    const sucursales = new Set(data.map(r => r.Sucursal));
    const rutas = new Set(data.map(r => r.Ruta));
    const estatuses = data.reduce((acc, r) => { acc[r.Estatus] = (acc[r.Estatus] || 0) + 1; return acc; }, {});
    const maquiladores = new Set(data.map(r => r.Maquilador));
    return { sucursales: sucursales.size, estudios: data.length, rutas: rutas.size, maquiladores: maquiladores.size, estatuses };
  }, [data]);

  return (
    <>
      <section className="filters">
        <div className="filter-group">
          <label>Fecha Inicio</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Fecha Fin</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <MultiSearchSelect label="Ciudad" icon={MapPin} options={meta.ciudades} selected={selectedCiudades}
          onChange={setSelectedCiudades} getLabel={c => c} getValue={c => c} allLabel="Todas" />
        <MultiSearchSelect label="Maquilador" icon={Factory} options={meta.maquiladores} selected={selectedMaquiladores}
          onChange={setSelectedMaquiladores} getLabel={m => m.name} getValue={m => m.id} allLabel="Todos" />
        <button className="btn-primary" onClick={fetchData} disabled={loading}>
          {loading ? <Loader2 className="spin" size={16} /> : 'Consultar'}
        </button>
        <div className="export-group">
          <button className="btn-secondary" onClick={() => exportMaquilasCSV(data)} disabled={!data.length}>
            <Download size={16} /> CSV
          </button>
          <button className="btn-secondary btn-excel" onClick={() => exportMaquilasExcel(data)} disabled={!data.length}>
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button className="btn-secondary btn-pdf" onClick={() => exportMaquilasPDF(data, startDate, endDate)} disabled={!data.length}>
            <FileText size={16} /> PDF
          </button>
        </div>
      </section>

      <section className="summary">
        <SummaryCard icon={Building2} label="Sucursales" value={summary.sucursales} color="card-blue" />
        <SummaryCard icon={FlaskConical} label="Estudios" value={summary.estudios} color="card-purple" />
        <SummaryCard icon={Route} label="Rutas" value={summary.rutas} color="card-green" />
        <SummaryCard icon={Factory} label="Maquiladores" value={summary.maquiladores} color="card-orange" />
        <SummaryCard icon={Send} label="Enviado" value={summary.estatuses['Enviado'] || 0} color="card-teal" />
        <SummaryCard icon={ClipboardList} label="Solicitado" value={summary.estatuses['Solicitado'] || 0} color="card-yellow" />
        <SummaryCard icon={CheckCircle} label="Recibido" value={summary.estatuses['Recibido'] || 0} color="card-emerald" />
        <SummaryCard icon={XCircle} label="Cancelado" value={summary.estatuses['Cancelado'] || 0} color="card-red" />
      </section>

      <section className="search-bar">
        <Search size={18} className="search-icon" />
        <input type="text" placeholder="Buscar en todos los campos..." value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} />
      </section>

      {error && <div className="error-msg">Error: {error}</div>}

      <DataTable data={data} columns={maquilasColumns} loading={loading} globalFilter={globalFilter} setGlobalFilter={setGlobalFilter} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// INDICADORES REPORT (Daily & Monthly)
// ═══════════════════════════════════════════════════════════════════

const indicadoresDailyColumns = [
  { accessorKey: 'FechaTrabajo', header: 'Fecha' },
  { accessorKey: 'Sucursal', header: 'Sucursal', cell: ({ getValue }) => {
    const v = getValue(); return v === 'TOTAL' ? <strong>{v}</strong> : v;
  }},
  { accessorKey: 'CantidadSolicitudes', header: 'Solicitudes', cell: ({ getValue }) => Number(getValue()).toLocaleString('es-MX') },
  { accessorKey: 'TotalPagos', header: 'Total Pagos', cell: ({ getValue }) => formatCurrency(getValue()) },
  { accessorKey: 'CostoToma', header: 'Costo Toma', cell: ({ getValue }) => formatCurrency(getValue()) },
];

const indicadoresMonthlyColumns = [
  { accessorKey: 'MesTrabajo', header: 'Mes' },
  { accessorKey: 'Sucursal', header: 'Sucursal', cell: ({ getValue }) => {
    const v = getValue(); return v === 'TOTAL' ? <strong>{v}</strong> : v;
  }},
  { accessorKey: 'CantidadSolicitudes', header: 'Solicitudes', cell: ({ getValue }) => Number(getValue()).toLocaleString('es-MX') },
  { accessorKey: 'TotalPagos', header: 'Total Pagos', cell: ({ getValue }) => formatCurrency(getValue()) },
  { accessorKey: 'CostoToma', header: 'Costo Toma', cell: ({ getValue }) => formatCurrency(getValue()) },
];

function exportIndicadoresExcel(data, reportType) {
  if (!data.length) return;
  const isDaily = reportType === 'daily';
  const dateKey = isDaily ? 'FechaTrabajo' : 'MesTrabajo';
  const dateHeader = isDaily ? 'Fecha' : 'Mes';
  const headers = [dateHeader, 'Sucursal', 'Solicitudes', 'Total Pagos', 'Costo Toma'];
  const rows = data.map(row => ({
    [dateHeader]: row[dateKey],
    'Sucursal': row.Sucursal,
    'Solicitudes': row.CantidadSolicitudes,
    'Total Pagos': row.TotalPagos,
    'Costo Toma': row.CostoToma,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 16) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Indicadores ${isDaily ? 'Diario' : 'Mensual'}`);
  XLSX.writeFile(wb, `indicadores_${reportType}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportIndicadoresPDF(data, reportType, startDate, endDate) {
  if (!data.length) return;
  const isDaily = reportType === 'daily';
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 15;

  doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
  doc.text('Laboratorio Alfonso Ramos S.A de C.V.', pageW / 2, m + 4, { align: 'center' });
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text(`REPORTE DE INDICADORES - ${isDaily ? 'DIARIO' : 'MENSUAL'}`, pageW / 2, m + 10, { align: 'center' });
  doc.setFontSize(7); doc.setTextColor(100);
  doc.text(`Fecha Inicio: ${startDate}    Fecha Fin: ${endDate}`, pageW / 2, m + 15, { align: 'center' });

  const dateKey = isDaily ? 'FechaTrabajo' : 'MesTrabajo';
  const dateHeader = isDaily ? 'Fecha' : 'Mes';

  autoTable(doc, {
    startY: m + 20,
    head: [[dateHeader, 'Sucursal', 'Solicitudes', 'Total Pagos', 'Costo Toma']],
    body: data.map(row => [
      row[dateKey],
      row.Sucursal,
      Number(row.CantidadSolicitudes).toLocaleString('es-MX'),
      formatCurrency(row.TotalPagos),
      formatCurrency(row.CostoToma),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.raw[1] === 'TOTAL') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [219, 234, 254];
      }
    },
    margin: { left: m, right: m },
  });

  const tp = doc.getNumberOfPages();
  for (let i = 1; i <= tp; i++) {
    doc.setPage(i);
    doc.setFontSize(6); doc.setTextColor(120); doc.setFont(undefined, 'normal');
    const ts = `${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
    doc.text(ts, m, pageH - 8);
    doc.text('Este informe no podrá ser reproducido total o parcialmente.', m, pageH - 4);
    doc.text(`Página ${i}/${tp}`, pageW - m, pageH - 8, { align: 'right' });
  }

  doc.save(`indicadores_${reportType}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function IndicadoresReport({ reportKey, onLogout }) {
  const isDaily = reportKey === 'indicadores-daily';
  const now = new Date();

  const today = now.toISOString().slice(0, 10);
  const defaultStart = isDaily
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString().slice(0, 10)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString().slice(0, 10);
  const defaultEnd = today;

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [globalFilter, setGlobalFilter] = useState('');

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await authFetch(`${API_BASE}/api/reports/${reportKey}?${params}`);
      if (res.status === 401) { onLogout(); return; }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      // Mark TOTAL rows for styling
      setData(json.map(row => ({ ...row, _isTotal: row.Sucursal === 'TOTAL' })));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [reportKey]);

  const columns = isDaily ? indicadoresDailyColumns : indicadoresMonthlyColumns;
  const reportType = isDaily ? 'daily' : 'monthly';

  return (
    <>
      <section className="filters">
        <div className="filter-group">
          <label>Fecha Inicio</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Fecha Fin</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={fetchData} disabled={loading}>
          {loading ? <Loader2 className="spin" size={16} /> : 'Consultar'}
        </button>
        <div className="export-group">
          <button className="btn-secondary btn-excel" onClick={() => exportIndicadoresExcel(data, reportType)} disabled={!data.length}>
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button className="btn-secondary btn-pdf" onClick={() => exportIndicadoresPDF(data, reportType, startDate, endDate)} disabled={!data.length}>
            <FileText size={16} /> PDF
          </button>
        </div>
      </section>

      {error && <div className="error-msg">Error: {error}</div>}

      <section className="search-bar">
        <Search size={18} className="search-icon" />
        <input type="text" placeholder="Buscar..." value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} />
      </section>

      <DataTable data={data} columns={columns} loading={loading} globalFilter={globalFilter} setGlobalFilter={setGlobalFilter} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MEDICOS REPORT
// ═══════════════════════════════════════════════════════════════════

const medicosColumns = [
  { accessorKey: 'MesTrabajo', header: 'Mes' },
  { accessorKey: 'Medico', header: 'Médico' },
  { accessorKey: 'CantidadSolicitudes', header: 'Solicitudes', cell: ({ getValue }) => Number(getValue()).toLocaleString('es-MX') },
  { accessorKey: 'Ingreso', header: 'Ingreso', cell: ({ getValue }) => formatCurrency(getValue()) },
  { accessorKey: 'TicketPromedio', header: 'Ticket Promedio', cell: ({ getValue }) => formatCurrency(getValue()) },
];

function exportMedicosExcel(data) {
  if (!data.length) return;
  const headers = ['Mes', 'Médico', 'Solicitudes', 'Ingreso', 'Ticket Promedio'];
  const rows = data.map(row => ({
    'Mes': row.MesTrabajo,
    'Médico': row.Medico,
    'Solicitudes': row.CantidadSolicitudes,
    'Ingreso': row.Ingreso,
    'Ticket Promedio': row.TicketPromedio,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 18) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte Médicos');
  XLSX.writeFile(wb, `reporte_medicos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportMedicosPDF(data, startDate, endDate) {
  if (!data.length) return;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 15;

  doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
  doc.text('Laboratorio Alfonso Ramos S.A de C.V.', pageW / 2, m + 4, { align: 'center' });
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text('REPORTE DE MÉDICOS', pageW / 2, m + 10, { align: 'center' });
  doc.setFontSize(7); doc.setTextColor(100);
  doc.text(`Fecha Inicio: ${startDate}    Fecha Fin: ${endDate}`, pageW / 2, m + 15, { align: 'center' });

  autoTable(doc, {
    startY: m + 20,
    head: [['Mes', 'Médico', 'Solicitudes', 'Ingreso', 'Ticket Promedio']],
    body: data.map(row => [
      row.MesTrabajo,
      row.Medico,
      Number(row.CantidadSolicitudes).toLocaleString('es-MX'),
      formatCurrency(row.Ingreso),
      formatCurrency(row.TicketPromedio),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { cellWidth: 80 } },
    margin: { left: m, right: m },
  });

  const tp = doc.getNumberOfPages();
  for (let i = 1; i <= tp; i++) {
    doc.setPage(i);
    doc.setFontSize(6); doc.setTextColor(120); doc.setFont(undefined, 'normal');
    const ts = `${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
    doc.text(ts, m, pageH - 8);
    doc.text('Este informe no podrá ser reproducido total o parcialmente.', m, pageH - 4);
    doc.text(`Página ${i}/${tp}`, pageW - m, pageH - 8, { align: 'right' });
  }

  doc.save(`reporte_medicos_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function MedicosReport({ onLogout }) {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString().slice(0, 10));
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [globalFilter, setGlobalFilter] = useState('');

  // Meta (comboboxes)
  const [meta, setMeta] = useState({ medicos: [], especialidades: [], ciudades: [] });
  const [selectedMedicos, setSelectedMedicos] = useState([]);
  const [selectedEspecialidades, setSelectedEspecialidades] = useState([]);
  const [selectedCiudades, setSelectedCiudades] = useState([]);

  useEffect(() => {
    authFetch(`${API_BASE}/api/reports/medicos/meta`).then(r => r.json()).then(setMeta).catch(() => {});
  }, []);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (selectedMedicos.length) params.set('medicoId', selectedMedicos.join(','));
      if (selectedEspecialidades.length) params.set('especialidadId', selectedEspecialidades.join(','));
      if (selectedCiudades.length) params.set('ciudadId', selectedCiudades.join(','));
      const res = await authFetch(`${API_BASE}/api/reports/medicos?${params}`);
      if (res.status === 401) { onLogout(); return; }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setData(await res.json());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <>
      <section className="filters">
        <div className="filter-group">
          <label>Fecha Inicio</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Fecha Fin</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <MultiSearchSelect label="Médico" icon={Stethoscope} options={meta.medicos} selected={selectedMedicos}
          onChange={setSelectedMedicos} getLabel={m => m.nombre} getValue={m => m.id} allLabel="Todos" />
        <MultiSearchSelect label="Especialidad" icon={FlaskConical} options={meta.especialidades} selected={selectedEspecialidades}
          onChange={setSelectedEspecialidades} getLabel={e => e.nombre} getValue={e => String(e.id)} allLabel="Todas" />
        <MultiSearchSelect label="Ciudad" icon={MapPin} options={meta.ciudades} selected={selectedCiudades}
          onChange={setSelectedCiudades} getLabel={c => c} getValue={c => c} allLabel="Todas" />
        <button className="btn-primary" onClick={fetchData} disabled={loading}>
          {loading ? <Loader2 className="spin" size={16} /> : 'Consultar'}
        </button>
        <div className="export-group">
          <button className="btn-secondary btn-excel" onClick={() => exportMedicosExcel(data)} disabled={!data.length}>
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button className="btn-secondary btn-pdf" onClick={() => exportMedicosPDF(data, startDate, endDate)} disabled={!data.length}>
            <FileText size={16} /> PDF
          </button>
        </div>
      </section>

      {error && <div className="error-msg">Error: {error}</div>}

      <section className="search-bar">
        <Search size={18} className="search-icon" />
        <input type="text" placeholder="Buscar..." value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} />
      </section>

      <DataTable data={data} columns={medicosColumns} loading={loading} globalFilter={globalFilter} setGlobalFilter={setGlobalFilter} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD VIEW (KPIs + Charts)
// ═══════════════════════════════════════════════════════════════════

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#14b8a6', '#eab308', '#ef4444', '#06b6d4'];

function ChartCard({ title, children }) {
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function DashboardView({ role, onLogout }) {
  const now = new Date();
  const [startDate, setStartDate] = useState(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Admin data
  const [dailyData, setDailyData] = useState([]);
  const [medicosData, setMedicosData] = useState([]);
  // Usuario data
  const [maquilasData, setMaquilasData] = useState([]);

  const fetchDashboard = async () => {
    setLoading(true); setError(null);
    try {
      if (role === 'admin') {
        const params = new URLSearchParams({ startDate, endDate });
        const [daily, medicos] = await Promise.all([
          authFetch(`${API_BASE}/api/reports/indicadores-daily?${params}`).then(r => {
            if (r.status === 401) { onLogout(); return []; }
            return r.json();
          }),
          authFetch(`${API_BASE}/api/reports/medicos?${params}`).then(r => {
            if (r.status === 401) { onLogout(); return []; }
            return r.json();
          }),
        ]);
        setDailyData(daily);
        setMedicosData(medicos);
      } else {
        const params = new URLSearchParams({
          startDate: `${startDate}T00:00:00`,
          endDate: `${endDate}T23:59:59`,
        });
        const res = await authFetch(`${API_BASE}/api/reports/maquilas?${params}`);
        if (res.status === 401) { onLogout(); return; }
        setMaquilasData(await res.json());
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDashboard(); }, []);

  // ── Admin KPIs ──
  const adminKpis = useMemo(() => {
    const rows = dailyData.filter(r => r.Sucursal !== 'TOTAL');
    const totals = dailyData.filter(r => r.Sucursal === 'TOTAL');
    const totalSolicitudes = totals.reduce((s, r) => s + (r.CantidadSolicitudes || 0), 0);
    const totalPagos = totals.reduce((s, r) => s + (r.TotalPagos || 0), 0);
    const totalCostoToma = totals.reduce((s, r) => s + (r.CostoToma || 0), 0);
    const uniqueMedicos = new Set(medicosData.map(r => r.Medico)).size;
    const totalIngreso = medicosData.reduce((s, r) => s + (r.Ingreso || 0), 0);
    const uniqueDays = new Set(rows.map(r => r.FechaTrabajo)).size;
    const avgDailySolicitudes = uniqueDays > 0 ? Math.round(totalSolicitudes / uniqueDays) : 0;
    return { totalSolicitudes, totalPagos, totalCostoToma, uniqueMedicos, totalIngreso, avgDailySolicitudes };
  }, [dailyData, medicosData]);

  // ── Admin Charts Data ──
  const dailyTrend = useMemo(() => {
    return dailyData
      .filter(r => r.Sucursal === 'TOTAL')
      .map(r => ({ fecha: r.FechaTrabajo, Solicitudes: r.CantidadSolicitudes, Pagos: r.TotalPagos }));
  }, [dailyData]);

  const sucursalBreakdown = useMemo(() => {
    const map = {};
    dailyData.filter(r => r.Sucursal !== 'TOTAL').forEach(r => {
      if (!map[r.Sucursal]) map[r.Sucursal] = { sucursal: r.Sucursal, Solicitudes: 0, Pagos: 0 };
      map[r.Sucursal].Solicitudes += r.CantidadSolicitudes || 0;
      map[r.Sucursal].Pagos += r.TotalPagos || 0;
    });
    return Object.values(map).sort((a, b) => b.Solicitudes - a.Solicitudes);
  }, [dailyData]);

  const topMedicos = useMemo(() => {
    const map = {};
    medicosData.forEach(r => {
      if (!map[r.Medico]) map[r.Medico] = { medico: r.Medico, Solicitudes: 0, Ingreso: 0 };
      map[r.Medico].Solicitudes += r.CantidadSolicitudes || 0;
      map[r.Medico].Ingreso += r.Ingreso || 0;
    });
    return Object.values(map).sort((a, b) => b.Solicitudes - a.Solicitudes).slice(0, 10).map(m => ({
      ...m, medico: m.medico.length > 30 ? m.medico.slice(0, 28) + '…' : m.medico,
    }));
  }, [medicosData]);

  // ── Usuario KPIs ──
  const usuarioKpis = useMemo(() => {
    const sucursales = new Set(maquilasData.map(r => r.Sucursal)).size;
    const estudios = maquilasData.length;
    const maquiladores = new Set(maquilasData.map(r => r.Maquilador)).size;
    const estatuses = maquilasData.reduce((acc, r) => { acc[r.Estatus] = (acc[r.Estatus] || 0) + 1; return acc; }, {});
    return { sucursales, estudios, maquiladores, estatuses };
  }, [maquilasData]);

  const maquilasBySucursal = useMemo(() => {
    const map = {};
    maquilasData.forEach(r => {
      if (!map[r.Sucursal]) map[r.Sucursal] = { sucursal: r.Sucursal, Estudios: 0 };
      map[r.Sucursal].Estudios += 1;
    });
    return Object.values(map).sort((a, b) => b.Estudios - a.Estudios);
  }, [maquilasData]);

  const maquilasByEstatus = useMemo(() => {
    const map = {};
    maquilasData.forEach(r => {
      if (!map[r.Estatus]) map[r.Estatus] = { name: r.Estatus, value: 0 };
      map[r.Estatus].value += 1;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [maquilasData]);

  const tooltipStyle = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '12px',
  };

  return (
    <>
      <section className="filters">
        <div className="filter-group">
          <label>Fecha Inicio</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>Fecha Fin</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={fetchDashboard} disabled={loading}>
          {loading ? <Loader2 className="spin" size={16} /> : 'Consultar'}
        </button>
      </section>

      {error && <div className="error-msg">Error: {error}</div>}

      {loading && (
        <div className="dashboard-loading">
          <Loader2 className="spin" size={32} />
          <span>Cargando datos...</span>
        </div>
      )}

      {!loading && role === 'admin' && (
        <>
          <section className="summary">
            <SummaryCard icon={ClipboardList} label="Total Solicitudes" value={adminKpis.totalSolicitudes.toLocaleString('es-MX')} color="card-blue" />
            <SummaryCard icon={DollarSign} label="Total Pagos" value={formatCurrency(adminKpis.totalPagos)} color="card-green" />
            <SummaryCard icon={Activity} label="Costo Toma" value={formatCurrency(adminKpis.totalCostoToma)} color="card-orange" />
            <SummaryCard icon={TrendingUp} label="Promedio Diario" value={adminKpis.avgDailySolicitudes.toLocaleString('es-MX')} color="card-teal" />
            <SummaryCard icon={Users} label="Médicos Activos" value={adminKpis.uniqueMedicos.toLocaleString('es-MX')} color="card-purple" />
            <SummaryCard icon={DollarSign} label="Ingreso Médicos" value={formatCurrency(adminKpis.totalIngreso)} color="card-emerald" />
          </section>

          <section className="dashboard-charts">
            <ChartCard title="Tendencia Diaria de Solicitudes">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Line type="monotone" dataKey="Solicitudes" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Solicitudes por Sucursal">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={sucursalBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="sucursal" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar dataKey="Solicitudes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Pagos" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top 10 Médicos por Solicitudes">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={topMedicos} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="medico" type="category" tick={{ fontSize: 10 }} width={150} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar dataKey="Solicitudes" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Pagos Diarios">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(v)} />
                  <Line type="monotone" dataKey="Pagos" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </section>
        </>
      )}

      {!loading && role !== 'admin' && (
        <>
          <section className="summary">
            <SummaryCard icon={Building2} label="Sucursales" value={usuarioKpis.sucursales} color="card-blue" />
            <SummaryCard icon={FlaskConical} label="Estudios" value={usuarioKpis.estudios.toLocaleString('es-MX')} color="card-purple" />
            <SummaryCard icon={Factory} label="Maquiladores" value={usuarioKpis.maquiladores} color="card-orange" />
            <SummaryCard icon={Send} label="Enviado" value={usuarioKpis.estatuses['Enviado'] || 0} color="card-teal" />
          </section>

          <section className="dashboard-charts">
            <ChartCard title="Estudios por Sucursal">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={maquilasBySucursal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="sucursal" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="Estudios" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Distribución por Estatus">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={maquilasByEstatus} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {maquilasByEstatus.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </section>
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN APP WITH SIDEBAR
// ═══════════════════════════════════════════════════════════════════

export default function App() {
  // Require both token and role — old tokens without role force re-login
  const hasValidSession = !!getToken() && !!localStorage.getItem('role');
  const [authed, setAuthed] = useState(hasValidSession);
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [role, setRole] = useState(localStorage.getItem('role') || '');

  const handleLogin = (data) => {
    setAuthed(true);
    setUsername(data.username);
    setRole(data.role);
    localStorage.setItem('role', data.role);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    setAuthed(false);
    setUsername('');
    setRole('');
  };

  if (!authed) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard username={username} role={role} onLogout={handleLogout} />;
}

function Dashboard({ username, role, onLogout }) {
  const allowedReports = role === 'admin'
    ? ['dashboard', 'indicadores-daily', 'indicadores-monthly', 'medicos']
    : ['dashboard', 'maquilas'];

  const [activeReport, setActiveReport] = useState(allowedReports[0]);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const reportConfig = REPORT_CONFIG[activeReport];
  const ReportIcon = reportConfig?.icon || BarChart3;

  function renderReport() {
    switch (activeReport) {
      case 'dashboard':
        return <DashboardView role={role} onLogout={onLogout} />;
      case 'maquilas':
        return <MaquilasReport onLogout={onLogout} />;
      case 'indicadores-daily':
      case 'indicadores-monthly':
        return <IndicadoresReport key={activeReport} reportKey={activeReport} onLogout={onLogout} />;
      case 'medicos':
        return <MedicosReport onLogout={onLogout} />;
      default:
        return null;
    }
  }

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Mobile overlay */}
      {sidebarMobileOpen && <div className="sidebar-overlay" onClick={() => setSidebarMobileOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarMobileOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <img
            src="https://pub-4f241080e05a42db9146d29bde1cdd96.r2.dev/logo/logo_laboratorio_ramos.svg"
            alt="Laboratorio Ramos"
            className="sidebar-logo"
          />
          <button className="sidebar-close mobile-only" onClick={() => setSidebarMobileOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Reportes</span>
          {allowedReports.map(key => {
            const cfg = REPORT_CONFIG[key];
            const Icon = cfg.icon;
            return (
              <button
                key={key}
                className={`sidebar-item ${activeReport === key ? 'sidebar-item-active' : ''}`}
                onClick={() => { setActiveReport(key); setSidebarMobileOpen(false); }}
                title={cfg.name}
              >
                <Icon size={18} />
                <span className="sidebar-item-text">{cfg.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="sidebar-username">{username}</span>
            <span className="sidebar-role">{role === 'admin' ? 'Administrador' : 'Usuario'}</span>
          </div>
          <button className="btn-logout" onClick={onLogout} title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          className="sidebar-collapse-btn desktop-only"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Expandir' : 'Colapsar'}
        >
          {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </aside>

      {/* Main content */}
      <div className="main-content">
        <header className="header">
          <div className="header-content">
            <button className="sidebar-toggle mobile-only" onClick={() => setSidebarMobileOpen(true)}>
              <Menu size={22} />
            </button>
            <ReportIcon size={22} className="header-report-icon" />
            <h1 className="header-title">{reportConfig?.name}</h1>
          </div>
        </header>

        <main className="main">
          {renderReport()}
        </main>
      </div>
    </div>
  );
}

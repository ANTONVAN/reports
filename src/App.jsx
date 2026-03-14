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
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Login from './Login';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_URL = `${API_BASE}/api/reports/maquilas`;

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

function exportCSV(data) {
  if (!data.length) return;
  const headers = [
    'Sucursal',
    'Solicitud',
    'Medico',
    'Clave Estudio',
    'Nombre Estudio',
    'Estatus',
    'Ruta',
    'Maquilador',
    'Fecha de Entrega',
  ];
  const keys = [
    'Sucursal',
    'Solicitud',
    'Medico',
    'ClaveEstudio',
    'NombreEstudio',
    'Estatus',
    'Ruta',
    'Maquilador',
    'FechaEntrega',
  ];
  const csv = [
    headers.join(','),
    ...data.map((row) =>
      keys.map((k) => `"${(row[k] ?? '').toString().replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte_maquilas_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const EXPORT_HEADERS = [
  'Sucursal',
  'Solicitud',
  'Médico',
  'Clave Estudio',
  'Nombre Estudio',
  'Estatus',
  'Ruta',
  'Maquilador',
  'Fecha de Entrega',
];
const EXPORT_KEYS = [
  'Sucursal',
  'Solicitud',
  'Medico',
  'ClaveEstudio',
  'NombreEstudio',
  'Estatus',
  'Ruta',
  'Maquilador',
  'FechaEntrega',
];

function exportExcel(data) {
  if (!data.length) return;
  const rows = data.map((row) =>
    EXPORT_KEYS.reduce((acc, key, i) => {
      acc[EXPORT_HEADERS[i]] = key === 'FechaEntrega' ? formatDate(row[key]) : (row[key] ?? '');
      return acc;
    }, {})
  );
  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto-size columns
  ws['!cols'] = EXPORT_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 18) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte Maquilas');
  XLSX.writeFile(wb, `reporte_maquilas_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportPDF(data, startDate, endDate) {
  if (!data.length) return;
  const margin = 10;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Title
  doc.setFontSize(14);
  doc.text('Laboratorio Ramos - Reporte de Maquilas', margin, margin + 4);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Fecha Inicio: ${startDate}    Fecha Fin: ${endDate}`, margin, margin + 10);

  const rows = data.map((row) =>
    EXPORT_KEYS.map((key) =>
      key === 'FechaEntrega' ? formatDate(row[key]) : (row[key] ?? '')
    )
  );

  const statusColors = {
    Enviado:    [29, 78, 216],
    Solicitado: [180, 83, 9],
    Recibido:   [4, 120, 87],
    Validado:   [4, 120, 87],
    Cancelado:  [220, 38, 38],
  };
  const estatusColIndex = EXPORT_HEADERS.indexOf('Estatus');

  autoTable(doc, {
    head: [EXPORT_HEADERS],
    body: rows,
    startY: margin + 14,
    margin: { top: margin, right: margin, bottom: margin, left: margin },
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === estatusColIndex) {
        const color = statusColors[data.cell.raw];
        if (color) {
          data.cell.styles.textColor = color;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  doc.save(`reporte_maquilas_${new Date().toISOString().slice(0, 10)}.pdf`);
}

const columns = [
  {
    accessorKey: 'Sucursal',
    header: 'Sucursal',
  },
  {
    accessorKey: 'Solicitud',
    header: 'Solicitud',
  },
  {
    accessorKey: 'Medico',
    header: 'Médico',
  },
  {
    accessorKey: 'ClaveEstudio',
    header: 'Clave Estudio',
  },
  {
    accessorKey: 'NombreEstudio',
    header: 'Nombre Estudio',
  },
  {
    accessorKey: 'Estatus',
    header: 'Estatus',
    cell: ({ getValue }) => <StatusBadge status={getValue()} />,
  },
  {
    accessorKey: 'Ruta',
    header: 'Ruta',
  },
  {
    accessorKey: 'Maquilador',
    header: 'Maquilador',
  },
  {
    accessorKey: 'FechaEntrega',
    header: 'Fecha Entrega',
    cell: ({ getValue }) => formatDate(getValue()),
  },
];

const PAGE_SIZE = 100;

function MobileCard({ row }) {
  return (
    <div className="mobile-card">
      <div className="mobile-card-header">
        <span className="mobile-card-solicitud">{row.Solicitud}</span>
        <StatusBadge status={row.Estatus} />
      </div>
      <div className="mobile-card-body">
        <div className="mobile-card-row">
          <span className="mobile-card-label">Sucursal</span>
          <span>{row.Sucursal}</span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Médico</span>
          <span>{row.Medico}</span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Estudio</span>
          <span>{row.ClaveEstudio} — {row.NombreEstudio}</span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Ruta</span>
          <span>{row.Ruta}</span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Maquilador</span>
          <span>{row.Maquilador}</span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Entrega</span>
          <span>{formatDate(row.FechaEntrega)}</span>
        </div>
      </div>
    </div>
  );
}

function getDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [username, setUsername] = useState(localStorage.getItem('username') || '');

  const handleLogin = (data) => {
    setAuthed(true);
    setUsername(data.username);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setAuthed(false);
    setUsername('');
  };

  if (!authed) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard username={username} onLogout={handleLogout} />;
}

function Dashboard({ username, onLogout }) {
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState([]);
  const [isSticky, setIsSticky] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const sentinelRef = useRef(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(
        `${API_URL}?startDate=${startDate}&endDate=${endDate}`
      );
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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

  const summary = useMemo(() => {
    const sucursales = new Set(data.map((r) => r.Sucursal));
    const estudios = data.length;
    const rutas = new Set(data.map((r) => r.Ruta));
    const estatuses = data.reduce((acc, r) => {
      acc[r.Estatus] = (acc[r.Estatus] || 0) + 1;
      return acc;
    }, {});
    const maquiladores = new Set(data.map((r) => r.Maquilador));
    return { sucursales: sucursales.size, estudios, rutas: rutas.size, maquiladores: maquiladores.size, estatuses };
  }, [data]);

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
    <div className="app">
      <header className="header">
        <div className="header-content">
          <img
            src="https://pub-4f241080e05a42db9146d29bde1cdd96.r2.dev/logo/logo_laboratorio_ramos.svg"
            alt="Laboratorio Ramos"
            className="header-logo"
          />
          <p className="subtitle">Reporte de Maquilas</p>
          <div className="header-user">
            <span>{username}</span>
            <button className="btn-logout" onClick={onLogout} title="Cerrar sesión">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {/* Filters */}
        <section className="filters">
          <div className="filter-group">
            <label>Fecha Inicio</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label>Fecha Fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={fetchData} disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : 'Consultar'}
          </button>
          <div className="export-group">
            <button
              className="btn-secondary"
              onClick={() => exportCSV(table.getFilteredRowModel().rows.map((r) => r.original))}
              disabled={!data.length}
            >
              <Download size={16} /> CSV
            </button>
            <button
              className="btn-secondary btn-excel"
              onClick={() => exportExcel(table.getFilteredRowModel().rows.map((r) => r.original))}
              disabled={!data.length}
            >
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button
              className="btn-secondary btn-pdf"
              onClick={() => exportPDF(table.getFilteredRowModel().rows.map((r) => r.original), startDate, endDate)}
              disabled={!data.length}
            >
              <FileText size={16} /> PDF
            </button>
          </div>
        </section>

        {/* Summary Cards */}
        <section className="summary">
          <SummaryCard
            icon={Building2}
            label="Sucursales"
            value={summary.sucursales}
            color="card-blue"
          />
          <SummaryCard
            icon={FlaskConical}
            label="Estudios"
            value={summary.estudios}
            color="card-purple"
          />
          <SummaryCard
            icon={Route}
            label="Rutas"
            value={summary.rutas}
            color="card-green"
          />
          <SummaryCard
            icon={Factory}
            label="Maquiladores"
            value={summary.maquiladores}
            color="card-orange"
          />
          <SummaryCard
            icon={Send}
            label="Enviado"
            value={summary.estatuses['Enviado'] || 0}
            color="card-teal"
          />
          <SummaryCard
            icon={ClipboardList}
            label="Solicitado"
            value={summary.estatuses['Solicitado'] || 0}
            color="card-yellow"
          />
          <SummaryCard
            icon={CheckCircle}
            label="Recibido"
            value={summary.estatuses['Recibido'] || 0}
            color="card-emerald"
          />
          <SummaryCard
            icon={XCircle}
            label="Cancelado"
            value={summary.estatuses['Cancelado'] || 0}
            color="card-red"
          />
        </section>

        {/* Search */}
        <section className="search-bar">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar en todos los campos..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </section>

        {/* Error */}
        {error && <div className="error-msg">Error: {error}</div>}

        {/* Desktop Table */}
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
                  <tr key={row.id}>
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

        {/* Mobile Cards */}
        <section className="mobile-cards mobile-only">
          {table.getRowModel().rows.length === 0 ? (
            <div className="empty-state">{loading ? 'Cargando...' : 'Sin resultados'}</div>
          ) : (
            table.getRowModel().rows.map((row) => (
              <MobileCard key={row.id} row={row.original} />
            ))
          )}
        </section>

        {/* Pagination */}
        <footer className="pagination-footer">
          <span className="pagination-info">
            {table.getFilteredRowModel().rows.length} registros
            {table.getPageCount() > 1 && (
              <> — Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}</>
            )}
          </span>
          {table.getPageCount() > 1 && (
            <div className="pagination-controls">
              <button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="pagination-btn"
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="pagination-btn"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="pagination-btn"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="pagination-btn"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          )}
        </footer>
      </main>
    </div>
  );
}

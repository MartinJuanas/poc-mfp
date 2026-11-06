import { useState, useEffect, lazy, Suspense } from 'react';
import Dashboard from './components/Dashboard';
import { Icon, Skeleton, ErrorBoundary } from './components/UI';
import useResource from './hooks/useResource';
import useTheme from './hooks/useTheme';
import './theme.css';
import './App.css';
import './product.css';
const ExpenseAssistant = lazy(() => import('./components/ExpenseAssistant'));
const Movements = lazy(() => import('./components/Movements'));
const PdfUploader = lazy(() => import('./components/PdfUploader'));
const IncomeList = lazy(() => import('./components/IncomeList'));
const SavingsView = lazy(() => import('./components/SavingsView'));
const ExpensesView = lazy(() => import('./components/ExpensesView'));
const BulkUpload = lazy(() => import('./components/BulkUpload'));
const ReceiptComparison = lazy(() => import('./components/ReceiptComparison'));
const SalarySimulator = lazy(() => import('./components/SalarySimulator'));
const ReceiptDetail = lazy(() => import('./components/ReceiptDetail'));
const views = [
  { id: 'dashboard', label: 'Resumen', icon: 'dashboard', desc: 'Tu dinero, con perspectiva.' },
  { id: 'movements', label: 'Movimientos', icon: 'movements', desc: 'Todo lo que entra y sale, en un solo lugar.' },
  { id: 'expenses', label: 'Gastos', icon: 'expenses', desc: 'Cada gasto tiene su lugar.' },
  { id: 'savings', label: 'Metas y reservas', icon: 'goals', desc: 'Dale un destino a lo que ahorrás.' },
  { id: 'assistant', label: 'Asistente de gastos', icon: 'chat', desc: 'Pegá tu resumen, contame los detalles y revisá antes de guardar.' },
  { id: 'list', label: 'Documentos', icon: 'document', desc: 'Tus recibos y facturas, ordenados.' },
  { id: 'bulk', label: 'Carga masiva', icon: 'bulk', desc: 'Un año de recibos. Una sola carga.' },
  { id: 'compare', label: 'Comparar recibos', icon: 'compare', desc: 'Entendé qué cambió en tu sueldo.' },
  { id: 'simulator', label: 'Simulador', icon: 'simulator', desc: 'Explorá escenarios antes de decidir.' }
];
const initialView = () => views.some(v => v.id === location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
export default function App() {
  const {theme,toggle}=useTheme();
  const [activeView, setActiveView] = useState(initialView);
  const [menuOpen, setMenuOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [year, setYear] = useState('historical');
  const { data: years } = useResource('/dashboard/years', revision);
  const view = views.find(v => v.id === activeView);
  useEffect(() => { const onHash = () => { setActiveView(initialView()); setMenuOpen(false); }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  const go = id => { location.hash = id; setActiveView(id); setMenuOpen(false); };
  const refresh = () => setRevision(v => v + 1);
  return <div className="product-app">
    <a className="skip-link" href="#main-content">Ir al contenido</a>
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <a className="brand" href="#dashboard" onClick={() => go('dashboard')}><span className="brand-mark">m<span>·</span></span><span>misfinanzas<small>CLARIDAD PARA TU DINERO</small></span></a>
      <span className="nav-caption">TU ESPACIO</span>
      <nav aria-label="Navegación principal">{views.slice(0,4).map(v => <a key={v.id} href={`#${v.id}`} className={activeView === v.id ? 'selected' : ''} aria-current={activeView === v.id ? 'page' : undefined} onClick={() => go(v.id)}><Icon name={v.icon}/>{v.label}{activeView === v.id && <span className="nav-dot"/>}</a>)}</nav>
      <span className="nav-caption">DOCUMENTOS Y HERRAMIENTAS</span>
      <nav aria-label="Documentos y herramientas">{views.slice(4).map(v => <a key={v.id} href={`#${v.id}`} className={activeView === v.id ? 'selected' : ''} aria-current={activeView === v.id ? 'page' : undefined} onClick={() => go(v.id)}><Icon name={v.icon}/>{v.label}</a>)}</nav>
      <div className="sidebar-note"><Icon name="document"/><strong>Menos carga manual.</strong><p>Convertí tus recibos en información que te ayuda a decidir.</p><button onClick={() => go('list')}>Cargar un PDF <Icon name="arrow" size={16}/></button></div>
      <div className="sidebar-footer"><span className="avatar">MF</span><div>Finanzas personales<small>Tu espacio de gestión</small></div></div>
    </aside>
    {menuOpen && <button className="menu-shade" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}/>}
    <div className="workspace">
      <header className="workspace-bar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-expanded={menuOpen} aria-label="Abrir menú" onClick={() => setMenuOpen(v => !v)}><Icon name="menu"/></button><span>Mi espacio</span><span>/</span><strong>{view.label}</strong></div><div className="workspace-actions"><span className="workspace-date">{new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span><button className="theme-toggle" onClick={toggle} aria-label={theme==='dark'?'Activar modo claro':'Activar modo oscuro'} aria-pressed={theme==='dark'} title={theme==='dark'?'Modo claro':'Modo oscuro'}><Icon name={theme==='dark'?'sun':'moon'} size={18}/><span>{theme==='dark'?'Claro':'Oscuro'}</span></button></div></header>
      <main id="main-content" tabIndex={-1}>
        <div className="page-heading"><div><span className="eyebrow">FINANZAS PERSONALES</span><h1>{view.label}</h1><p>{view.desc}</p></div>{activeView === 'dashboard' ? <label className="period-filter"><span>Período</span><select aria-label="Período del resumen" value={year} onChange={e => setYear(e.target.value)}><option value="historical">Todo el historial</option>{(years || []).map(y => <option key={y} value={y}>{y}</option>)}</select></label> : null}</div>
        <ErrorBoundary key={activeView}><Suspense fallback={<Skeleton/>}>
          {activeView === 'dashboard' && <Dashboard year={year} revision={revision} onNavigate={go}/>}
          {activeView === 'movements' && <Movements revision={revision} onChange={refresh} onReceiptClick={setSelectedReceipt}/>}
          {activeView === 'list' && <><section className="document-intro panel"><div><span className="eyebrow">DEL PDF A TUS FINANZAS</span><h2>Subí, revisá y confirmá.</h2><p>Extraemos el período, los conceptos y el total. Vos tenés la última palabra.</p></div><PdfUploader onUploadSuccess={refresh}/></section><IncomeList refreshTrigger={revision} onReceiptClick={setSelectedReceipt} onChange={refresh}/></>}
          {activeView === 'bulk' && <BulkUpload onUploadComplete={refresh}/>}
          {activeView === 'savings' && <SavingsView onChange={refresh}/>}
          {activeView === 'assistant' && <ExpenseAssistant onChange={refresh}/>}
          {activeView === 'expenses' && <ExpensesView onChange={refresh}/>}
          {activeView === 'compare' && <ReceiptComparison/>}
          {activeView === 'simulator' && <SalarySimulator/>}
          {selectedReceipt && <ReceiptDetail receipt={selectedReceipt} onClose={() => setSelectedReceipt(null)} onDelete={refresh}/>}
        </Suspense></ErrorBoundary>
      </main>
      <footer className="workspace-footer"><span>misfinanzas</span><span>Más claridad. Mejores decisiones.</span></footer>
    </div>
    <nav className="bottom-nav" aria-label="Navegación móvil">{views.slice(0,4).map(v => <a key={v.id} href={`#${v.id}`} className={activeView === v.id ? 'selected' : ''} onClick={() => go(v.id)}><Icon name={v.icon}/><span>{v.id === 'savings' ? 'Metas' : v.label}</span></a>)}<button onClick={() => setMenuOpen(true)} aria-label="Más secciones"><Icon name="menu"/><span>Más</span></button></nav>
  </div>;
}

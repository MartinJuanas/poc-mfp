import { Modal, Notice } from './UI';
import useResource from '../hooks/useResource';
import React, { useState, useRef, useEffect } from 'react';
import api from '../services/api';
import './BulkUpload.css';

const MESES = [
  { val: 1, name: 'Enero' },
  { val: 2, name: 'Febrero' },
  { val: 3, name: 'Marzo' },
  { val: 4, name: 'Abril' },
  { val: 5, name: 'Mayo' },
  { val: 6, name: 'Junio' },
  { val: 7, name: 'Julio' },
  { val: 8, name: 'Agosto' },
  { val: 9, name: 'Septiembre' },
  { val: 10, name: 'Octubre' },
  { val: 11, name: 'Noviembre' },
  { val: 12, name: 'Diciembre' }
];

export default function BulkUpload({ onUploadComplete }) {
  const [selectedFiles, setSelectedFiles] = useState([]); // [{ file, relativePath, id }]
  const [isDragging, setIsDragging] = useState(false);
  const [batchData, setBatchData] = useState(null); // Documento BulkImport de la API
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [reviewingIndex, setReviewingIndex] = useState(null); // Índice del archivo en revisión manual
  const [manualYear, setManualYear] = useState(new Date().getFullYear());
  const [manualMonth, setManualMonth] = useState(1);
  const {data:limits}=useResource('/receipts/bulk/config');
  const [reviewAmount,setReviewAmount]=useState('');
  const [actionBusy,setActionBusy]=useState(false);
  const [directorySupported, setDirectorySupported] = useState(true);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  useEffect(() => {
    // Configurar atributos no estándares para el input de directorio
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }

    // Verificar soporte de directory/webkitdirectory
    const input = document.createElement('input');
    if (!('webkitdirectory' in input) && !('directory' in input)) {
      setDirectorySupported(false);
    }
  }, []);

  const batchId=batchData?._id;
  const batchStatus=batchData?.status;
  const completionRef=useRef(onUploadComplete);
  useEffect(()=>{completionRef.current=onUploadComplete;},[onUploadComplete]);
  useEffect(() => {
    if (!batchId || !['processing','created'].includes(batchStatus)) { setIsProcessing(false); return; }
    let cancelled=false; let timer;
    setIsProcessing(true);
    const poll=async()=>{
      try { const res=await api.getBulkImportStatus(batchId);
        if(cancelled)return;
        setBatchData(res.data);setError(null);
        if(!['processing','created'].includes(res.data.status)){setIsProcessing(false);completionRef.current?.(res.data);return;}
      } catch { if(cancelled)return;setError('No pudimos actualizar el progreso. Seguimos intentando; el lote continúa en el servidor.'); }
      timer=setTimeout(poll,1500);
    };
    timer=setTimeout(poll,1500);
    return()=>{cancelled=true;clearTimeout(timer);};
  }, [batchStatus,batchId]);

  // Recorrer entrada de arrastrar y soltar (soporta carpetas nativas via DataTransferItem.webkitGetAsEntry)
  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const items = e.dataTransfer.items;
    const filesArray = [];

    if (items && items.length > 0) {
      const entryPromises = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
          if (entry) {
            entryPromises.push(readEntry(entry));
          } else {
            const file = item.getAsFile();
            if (file && file.name.toLowerCase().endsWith('.pdf')) {
              filesArray.push({ file, relativePath: file.name, id: `${file.name}-${Date.now()}-${Math.random()}` });
            }
          }
        }
      }

      const results = await Promise.all(entryPromises);
      const flattened = results.flat();
      addFilesToQueue([...flattened,...filesArray]);
    } else {
      const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
      const parsed = files.map(f => ({
        file: f,
        relativePath: f.webkitRelativePath || f.name,
        id: `${f.name}-${Date.now()}-${Math.random()}`
      }));
      addFilesToQueue(parsed);
    }
  };

  // Función recursiva para leer carpetas arrastradas
  const readEntry = (entry, path = '') => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file) => {
          if (file.name.toLowerCase().endsWith('.pdf')) {
            const fullPath = path ? `${path}/${file.name}` : file.name;
            resolve([{ file, relativePath: fullPath, id: `${file.name}-${Date.now()}-${Math.random()}` }]);
          } else {
            resolve([]);
          }
        }, () => resolve([]));
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const entries=[];
        const readPage=()=>dirReader.readEntries(async page=>{
          if(page.length){entries.push(...page);readPage();return;}
          const results=await Promise.all(entries.map(e=>readEntry(e,path?`${path}/${entry.name}`:entry.name)));
          resolve(results.flat());
        },()=>resolve([]));
        readPage();
      } else {
        resolve([]);
      }
    });
  };

  const handleFileSelect = (e) => {
    setError(null);
    const files = Array.from(e.target.files);
    const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length < files.length) {
      setError(`Se ignoraron ${files.length - pdfFiles.length} archivo(s) por no ser PDF.`);
    }

    const parsed = pdfFiles.map(f => ({
      file: f,
      relativePath: f.webkitRelativePath || f.name,
      id: `${f.name}-${Date.now()}-${Math.random()}`
    }));

    addFilesToQueue(parsed);
    e.target.value = '';
  };

  const addFilesToQueue = (newItems) => {
    if (newItems.length === 0) {
      setError('No se encontraron archivos PDF válidos.');
      return;
    }

    const paths=new Set(selectedFiles.map(p=>p.relativePath));
    const filtered=newItems.filter(item=>{if(paths.has(item.relativePath))return false;paths.add(item.relativePath);return true;});
    if(limits && selectedFiles.length+filtered.length>limits.maxBulkFiles){setError(`Podés cargar hasta ${limits.maxBulkFiles} archivos por lote.`);return;}
    if(limits && filtered.some(item=>item.file.size>limits.maxFileSizeMB*1024*1024)){setError(`Hay archivos que superan ${limits.maxFileSizeMB} MB. Retiralos antes de continuar.`);return;}
    if(filtered.length<newItems.length)setError('Se ignoraron rutas que ya estaban en la lista.');
    setSelectedFiles(prev=>[...prev,...filtered]);
  };

  const removeFileFromQueue = (id) => {
    setSelectedFiles(prev => prev.filter(item => item.id !== id));
  };

  const clearQueue = () => {
    setSelectedFiles([]);
    setBatchData(null);
    setError(null);
  };

  const startBatchProcess = async () => {
    if (selectedFiles.length === 0) return;

    if(isProcessing || !limits) return;

    try {
      setError(null);
      setIsProcessing(true);

      const rawFiles = selectedFiles.map(item => item.file);
      const relativePaths = selectedFiles.map(item => item.relativePath);

      const res = await api.startBulkImport(rawFiles, relativePaths);
      if (res.success) {
        setBatchData(res.data);
      }
    } catch (err) {
      setError(err.message || 'Error al iniciar procesamiento masivo');
      setIsProcessing(false);
    }
  };

  const handleRetryAllFailed = async () => {
    if (!batchData) return;

    if(actionBusy)return;
    setActionBusy(true);
    try {
      setError(null);
      setIsProcessing(true);

      // Re-adjuntar archivos coincidentes si los tenemos en la cola local
      const failedFiles = batchData.files.filter(f => f.status === 'failed');
      const filesToSend = [];
      const indicesToSend = [];

      failedFiles.forEach(ff => {
        const found = selectedFiles[batchData.files.indexOf(ff)];
        if (found) {
          filesToSend.push(found.file);
          const indexInBatch = batchData.files.indexOf(ff);
          indicesToSend.push(indexInBatch);
        }
      });

      const res = await api.retryBulkFailed(batchData._id, filesToSend, indicesToSend);
      if (res.success) {
        setBatchData(res.data); setIsProcessing(false); onUploadComplete?.(res.data);
      }
    } catch (err) {
      setError(err.message || 'Error reintentando archivos fallidos');
      setIsProcessing(false);
    } finally { setActionBusy(false); }
  };

  const handleRetrySingle = async (index) => {
    if (!batchData) return;

    if(actionBusy)return;
    setActionBusy(true);
    try {
      setError(null);
      const targetFileDoc = batchData.files[index];
      const foundInLocal = selectedFiles[index];

      if (!foundInLocal) {
        setError(`No se encontró el archivo local para ${targetFileDoc.originalName}.`);
        return;
      }

      const res = await api.retryBulkFile(batchData._id, index, foundInLocal.file);
      if (res.success) {
        setBatchData(res.data); onUploadComplete?.(res.data);
      }
    } catch (err) {
      setError(err.message || 'Error al reintentar archivo');
    } finally { setActionBusy(false); }
  };

  const handleOpenReview = (index) => {
    const fileDoc = batchData.files[index];
    setReviewingIndex(index);
    setManualYear(fileDoc.detectedYear || new Date().getFullYear());
    setManualMonth(fileDoc.detectedMonth || 1);
    setReviewAmount(fileDoc.extractedData?.montoNeto ?? '');
  };

  const handleSaveReview = async () => {
    if (reviewingIndex === null || !batchData) return;

    if(actionBusy)return;
    setActionBusy(true);
    try {
      setError(null);
      if (!Number.isInteger(manualYear) || manualYear<1900 || manualYear>2100 || !Number.isInteger(manualMonth) || manualMonth<1 || manualMonth>12) {setError('Elegí un mes y año válidos.');return;}
      const res = await api.reviewBulkFile(batchData._id, reviewingIndex, manualYear, manualMonth, reviewAmount === '' ? undefined : Number(reviewAmount));
      if (res.success) {
        setBatchData(res.data);
        setReviewingIndex(null); onUploadComplete?.(res.data);
      }
    } catch (err) {
      setError(err.message || 'Error guardando revisión manual');
    } finally { setActionBusy(false); }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'saved': return 'saved';
      case 'duplicate': return 'duplicate';
      case 'failed': return 'failed';
      case 'needs_review': return 'needs_review';
      case 'uploading':
      case 'extracting':
      case 'validating': return 'extracting';
      default: return 'pending';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'Pendiente';
      case 'uploading': return 'Subiendo...';
      case 'extracting': return 'Extrayendo...';
      case 'validating': return 'Validando...';
      case 'saved': return 'Guardado';
      case 'duplicate': return 'Duplicado';
      case 'failed': return 'Error';
      case 'needs_review': return 'Requiere revisión';
      default: return status;
    }
  };

  return (
    <div className="bulk-upload-container"><ol className="bulk-steps"><li className={!batchData?'active':''}>1 · Seleccionar PDFs</li><li className={selectedFiles.length&&!batchData?'active':''}>2 · Vista previa</li><li className={isProcessing?'active':''}>3 · Procesar lote</li><li className={batchData&&!isProcessing?'active':''}>4 · Revisar resultados</li></ol>
      <header className="bulk-header">
        <div>
          <h2> Carga Masiva de Recibos</h2>
          <p>Subí múltiples PDFs organizados por carpeta o archivos sueltos</p>
        </div>
        {selectedFiles.length > 0 && !isProcessing && (
          <button className="btn-secondary-action" onClick={clearQueue}>
             Limpiar Todo
          </button>
        )}
      </header>

      {/* Área Drag & Drop */}
      {!batchData && (
        <div
          className={`bulk-dropzone ${isDragging ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={handleDrop}
        >
          <div className="dropzone-icon"></div>
          <div className="dropzone-title">Arrastrá una carpeta o varios recibos en PDF aquí</div>
          <div className="dropzone-subtitle">Se ordenarán y clasificarán automáticamente por año y mes</div>

          <div className="dropzone-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn-upload-select"
              onClick={() => fileInputRef.current?.click()}
            >
               Seleccionar Archivos
            </button>
            <button
              className="btn-upload-select"
              disabled={!directorySupported} onClick={() => folderInputRef.current?.click()}
            >
               Seleccionar Carpeta
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              hidden
              onChange={handleFileSelect}
            />
            <input
              ref={folderInputRef}
              type="file"
              accept=".pdf"
              multiple
              hidden
              onChange={handleFileSelect}
            />
          </div>

          {!directorySupported && (
            <div className="directory-notice">
               Tu navegador no soporta la selección directa de directorios. Podés arrastrar la carpeta o seleccionar múltiples archivos.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="upload-error">
           {error}
        </div>
      )}

      {/* Lista previa y Estado del Lote */}
      {(selectedFiles.length > 0 || batchData) && (
        <div className="queue-card">
          <div className="queue-header">
            <h3>
              {batchData ? `Lote: ${batchData.originalFolderName} (${batchData.files.length} archivos)` : `Archivos seleccionados (${selectedFiles.length})`}
            </h3>

            <div className="queue-header-actions">
              {!batchData && (
                <button
                  className="btn-start-process"
                  disabled={selectedFiles.length === 0 || isProcessing || !limits}
                  onClick={startBatchProcess}
                >
                   Procesar Lote
                </button>
              )}

              {batchData && batchData.failedFiles > 0 && !isProcessing && (
                <button className="btn-secondary-action" onClick={handleRetryAllFailed}>
                   Reintentar Fallidos ({batchData.failedFiles})
                </button>
              )}
            </div>
          </div>

          {/* Barra de progreso general */}
          {batchData && (
            <div className="progress-container">
              <div className="progress-info">
                <span>Estado: <strong>{{created:'Preparando',processing:'Procesando',completed:'Finalizado',completed_with_errors:'Finalizado con archivos para revisar',failed:'No pudimos completar el lote'}[batchData.status]||'Preparando'}</strong></span>
                <span>Procesados: {batchData.processedFiles} de {batchData.totalFiles} ({batchData.progress || 0}%)</span>
              </div>
              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${batchData.progress || 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Resumen de contadores */}
          {batchData && (
            <div className="summary-grid">
              <div className="summary-box total">
                <div className="num">{batchData.totalFiles}</div>
                <div className="lbl">Total</div>
              </div>
              <div className="summary-box success">
                <div className="num">{batchData.successfulFiles}</div>
                <div className="lbl">Guardados</div>
              </div>
              <div className="summary-box duplicate">
                <div className="num">{batchData.duplicateFiles}</div>
                <div className="lbl">Duplicados</div>
              </div>
              <div className="summary-box failed">
                <div className="num">{batchData.failedFiles}</div>
                <div className="lbl">Fallidos</div>
              </div>
              <div className="summary-box review">
                <div className="num">{batchData.needsReviewFiles}</div>
                <div className="lbl">Revisión</div>
              </div>
            </div>
          )}

          {/* Tabla / Lista de Archivos */}
          <div className="file-list">
            {!batchData ? (
              // Vista previa local antes de procesar
              selectedFiles.map((item) => (
                <div key={item.id} className="file-item">
                  <div className="file-details">
                    <span className="file-name">{item.file.name}</span>
                    <span className="file-path">{item.relativePath}</span>
                  </div>
                  <div className="file-meta">
                    <span className="file-size">{formatSize(item.file.size)}</span>
                    <span className="status-badge pending">Listo</span>
                    <button
                      className="btn-remove-file"
                      onClick={() => removeFileFromQueue(item.id)}
                      title="Eliminar de la cola"
                    >

                    </button>
                  </div>
                </div>
              ))
            ) : (
              // Estado del lote en servidor
              batchData.files.map((fileDoc, index) => (
                <div key={fileDoc._id || index} className="file-item">
                  <div className="file-details">
                    <span className="file-name">{fileDoc.originalName}</span>
                    <span className="file-path">{fileDoc.relativePath || fileDoc.originalName}</span>
                    {fileDoc.status === 'duplicate' && <span className="file-path">Este archivo o número de comprobante ya fue procesado.{fileDoc.duplicateProcessedAt ? ` Fecha: ${new Date(fileDoc.duplicateProcessedAt).toLocaleDateString('es-AR')}` : ''}</span>}
                    {fileDoc.status === 'needs_review' && <span className="file-path">{fileDoc.reviewReason === 'extraction' ? 'Revisá el importe extraído: la lectura fue incompleta o se usó extracción básica.' : 'No pudimos determinar automáticamente el período de este recibo.'}</span>}
                    {fileDoc.error && (
                      <span className="upload-error" style={{ margin: '0.2rem 0 0 0', padding: '0.2rem 0.5rem', fontSize: '0.78rem' }}>
                        {fileDoc.error}
                      </span>
                    )}
                  </div>

                  <div className="file-meta">
                    {fileDoc.detectedYear && fileDoc.detectedMonth && (
                      <span className="period-tag">
                         {fileDoc.detectedYear}-{String(fileDoc.detectedMonth).padStart(2, '0')}
                      </span>
                    )}

                    <span className={`status-badge ${getStatusBadgeClass(fileDoc.status)}`}>
                      {getStatusLabel(fileDoc.status)}
                    </span>

                    {fileDoc.status === 'needs_review' && (
                      <button
                        disabled={actionBusy} className="btn-mini-action"
                        onClick={() => handleOpenReview(index)}
                      >
                         Asignar Fecha
                      </button>
                    )}

                    {fileDoc.status === 'failed' && (
                      <button
                        disabled={actionBusy} className="btn-mini-action"
                        onClick={() => handleRetrySingle(index)}
                      >
                         Reintentar
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal de Revisión Manual */}
      {reviewingIndex !== null && (
        <Modal title="Revisar recibo" onClose={()=>!actionBusy&&setReviewingIndex(null)}><div>
            <h3> Revisión Manual de Período</h3>
            <p>El sistema no pudo determinar el período exacto de este recibo. Por favor seleccionalo manualmente:</p>

            <div className="modal-form-group">
              <label>
                Año:
                <input
                  type="number"
                  min="1900"
                  max="2100"
                  value={manualYear}
                  onChange={(e) => setManualYear(parseInt(e.target.value, 10))}
                />
              </label>

              <label>
                Mes:
                <select
                  value={manualMonth}
                  onChange={(e) => setManualMonth(parseInt(e.target.value, 10))}
                >
                  {MESES.map(m => (
                    <option key={m.val} value={m.val}>{m.val} - {m.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>Importe neto en ARS (revisá el PDF original)<input type="number" min="0" step="0.01" value={reviewAmount} onChange={e=>setReviewAmount(e.target.value)} placeholder="Importe extraído si está disponible"/></label>
            {error && <Notice error>{error}</Notice>}
            <div className="modal-actions">
              <button className="btn-secondary-action" onClick={() => setReviewingIndex(null)}>
                Cancelar
              </button>
              <button disabled={actionBusy} className="btn-start-process" onClick={handleSaveReview}>
                Guardar y Confirmar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

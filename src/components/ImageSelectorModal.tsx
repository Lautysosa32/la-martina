import React, { useState, useEffect } from 'react';
import { Search, Loader2, Image as ImageIcon, Check, X, AlertCircle } from 'lucide-react';

interface Candidate {
  id: string;
  url: string;
  title: string;
  source: string;
}

interface ImageSelectorModalProps {
  isOpen: boolean;
  query: string;
  productId: string;
  onClose: () => void;
  onSuccess: (url: string) => void;
}

export const ImageSelectorModal: React.FC<ImageSelectorModalProps> = ({ isOpen, query, productId, onClose, onSuccess }) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState<string>('');

  useEffect(() => {
    if (isOpen && query) {
      searchImages();
    } else {
      // Reset state on close
      setCandidates([]);
      setSelectedId(null);
      setError(null);
      setCustomUrl('');
    }
  }, [isOpen, query]);

  const searchImages = async () => {
    setIsLoading(true);
    setError(null);
    setCandidates([]);
    setSelectedId(null);

    try {
      const response = await fetch("http://127.0.0.1:8765/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error("El servidor local devolvió un error. ¿Está iniciado local_image_server.py?");
      }

      const data = await response.json();
      setCandidates(data.candidates || []);
      
      if (data.candidates?.length === 0) {
        setError("No se encontraron imágenes para este producto.");
      }
    } catch (err: any) {
      setError(err.message || "Error al conectar con el servidor local. Verifique que local_image_server.py esté en ejecución.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedId) return;
    
    setIsUploading(true);
    setError(null);

    try {
      const response = await fetch("http://127.0.0.1:8765/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          candidate_id: selectedId,
          product_id: productId
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Error al subir la imagen a R2.");
      }

      const data = await response.json();
      if (data.success && data.url) {
        onSuccess(data.url);
      } else {
        throw new Error("El servidor no devolvió una URL válida.");
      }
    } catch (err: any) {
      setError(err.message || "Error al confirmar la imagen.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCustomUpload = async () => {
    if (!customUrl.trim()) return;
    
    setIsUploading(true);
    setError(null);

    try {
      const response = await fetch("http://127.0.0.1:8765/upload_custom_url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url: customUrl.trim(),
          product_id: productId
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Error al procesar y subir la URL.");
      }

      const data = await response.json();
      if (data.success && data.url) {
        onSuccess(data.url);
      } else {
        throw new Error("El servidor no devolvió una URL válida.");
      }
    } catch (err: any) {
      setError(err.message || "Error al procesar la URL manual.");
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200/50">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-500" />
              Seleccionar Imagen
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Buscando: <span className="font-medium text-slate-700">"{query}"</span>
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            disabled={isUploading}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          
          <div className="mb-6 flex gap-2 items-center bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm">
            <span className="material-symbols-outlined text-slate-400 pl-2">link</span>
            <input 
              type="text" 
              placeholder="O pegá un link directo a la imagen aquí..." 
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-sm text-slate-700 placeholder:text-slate-400 min-w-0"
              disabled={isUploading || isLoading}
            />
            <button 
              onClick={handleCustomUpload}
              disabled={!customUrl.trim() || isUploading || isLoading}
              className="shrink-0 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {isUploading && customUrl.trim() ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="material-symbols-outlined text-[14px]">cloud_upload</span>}
              Subir link
            </button>
          </div>

          
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700 font-medium">{error}</div>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
              <p className="text-slate-600 font-medium">Buscando las mejores imágenes...</p>
              <p className="text-sm text-slate-400 mt-1">Conectando con fuentes locales para evadir WAF</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {candidates.map((candidate) => (
                <div 
                  key={candidate.id}
                  onClick={() => !isUploading && setSelectedId(candidate.id)}
                  className={`
                    relative group cursor-pointer bg-white rounded-xl overflow-hidden transition-all duration-200
                    ${selectedId === candidate.id 
                      ? 'ring-4 ring-indigo-500 shadow-xl scale-[1.02]' 
                      : 'border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'}
                  `}
                >
                  <div className="aspect-square bg-slate-100 flex items-center justify-center relative p-4">
                    <img 
                      src={candidate.url} 
                      alt={candidate.title}
                      className="max-w-full max-h-full object-contain mix-blend-multiply"
                    />
                    
                    {selectedId === candidate.id && (
                      <div className="absolute top-3 right-3 bg-indigo-500 text-white p-1 rounded-full shadow-lg">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  
                  <div className="p-3 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      {candidate.source}
                    </p>
                    <p className="text-sm text-slate-700 line-clamp-2" title={candidate.title}>
                      {candidate.title || "Imagen sin título"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && candidates.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <ImageIcon className="w-12 h-12 mb-4 opacity-50" />
              <p>No hay imágenes para mostrar.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
            disabled={isUploading}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!selectedId || isUploading}
            className={`
              flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium text-white rounded-xl shadow-sm transition-all
              ${!selectedId || isUploading 
                ? 'bg-slate-300 cursor-not-allowed opacity-70' 
                : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md'}
            `}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Descargando y subiendo a R2...
              </>
            ) : (
              <>
                Usar seleccionada
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

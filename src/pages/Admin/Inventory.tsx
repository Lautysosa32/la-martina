import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Category } from '../../data/mockData';
import { Product } from '../../types/product.types';
import { useAdmin } from '../../context/AdminContext';
import { useProductStore } from '../../stores/useProductStore';
import { PermissionGuard } from '../../components/auth/PermissionGuard';
import { useAuthStore } from '../../stores/useAuthStore';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

type SortKey = 'name' | 'categoryId' | 'stock' | 'price';
interface SortConfig {
  key: SortKey;
  direction: 'asc' | 'desc';
}

export const Inventory: React.FC = () => {
  const {
    adminCategories, adminTags,
    addCategory, updateCategory, deleteCategory,
    addTag, updateTag, deleteTag,
    searchProductExternal, formatCurrency
  } = useAdmin();

  const {
    products: adminProducts, loading: productsLoading, error: productsError, fetchProducts,
    addProduct, updateProduct, deleteProduct, updateStock, bulkUpdatePrice, bulkAddProducts,
    getProductByBarcode: findProductByBarcode
  } = useProductStore();

  const employeeProfile = useAuthStore((state) => state.employeeProfile);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const [scannerActive, setScannerActive] = useState(false);
  const [isSearchingExternal, setIsSearchingExternal] = useState(false);
  const scannerBufferRef = useRef('');
  const scannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([]);

  const categoryScrollRef = useRef<HTMLDivElement>(null);

  // Modales
  const [showProductModal, setShowProductModal] = useState<{ show: boolean, mode: 'new' | 'edit', product?: Product }>({ show: false, mode: 'new' });
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState<{ show: boolean, type: 'category' | 'tag' }>({ show: false, type: 'category' });
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'product' | 'category' | 'tag' } | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  // Form States
  const [productForm, setProductForm] = useState({ id: '', name: '', brand: '', categoryId: '', price: '', image: '', format: '', badge: '', originalPrice: '', stock: '0', minStock: '15', barcode: '' });
  const [bulkPercent, setBulkPercent] = useState('');
  const [editItem, setEditItem] = useState<{ id: string, value: string } | null>(null);
  const [newItemName, setNewItemName] = useState('');

  // Import States
  const [showImportReview, setShowImportReview] = useState(false);
  const [importData, setImportData] = useState<{
    valid: any[],
    errors: any[],
    duplicates: any[],
    incomplete: any[]
  }>({ valid: [], errors: [], duplicates: [], incomplete: [] });
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Asegurar que el portal tenga su destino listo
  useEffect(() => {
    setPortalTarget(document.getElementById('admin-header-portal'));
  }, []);

  // Lógica para scroll horizontal con la rueda del mouse
  useEffect(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) { e.preventDefault(); el.scrollLeft += e.deltaY; }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const processBarcode = async (code: string) => {
    console.log("Procesando código:", code);
    setScannerActive(true);
    setTimeout(() => setScannerActive(false), 2000);

    const found = findProductByBarcode(code);
    if (found) {
      console.log("Producto encontrado localmente:", found.name);
      openProductModal('edit', found);
    } else {
      console.log("Buscando en Open Food Facts...");
      setIsSearchingExternal(true);
      const externalData = await searchProductExternal(code);
      setIsSearchingExternal(false);

      if (externalData) {
        console.log("Datos encontrados externamente:", externalData);
        setProductForm({
          id: '',
          name: externalData.name || '',
          brand: externalData.brand || '',
          categoryId: adminCategories[0]?.id || 'almacen',
          price: '',
          image: externalData.image || '',
          format: externalData.format || '',
          badge: '',
          originalPrice: '',
          stock: '0',
          minStock: '15',
          barcode: code
        });
      } else {
        console.log("No se encontraron datos externos.");
        setProductForm(prev => ({ ...prev, id: '', name: '', brand: '', categoryId: adminCategories[0]?.id || 'almacen', price: '', image: '', format: '', badge: '', originalPrice: '', stock: '0', minStock: '15', barcode: code }));
      }
      setShowProductModal({ show: true, mode: 'new' });
    }
  };

  // Scanner listener: detecta entrada rápida de teclado o pegado (Ctrl+V)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const code = scannerBufferRef.current;
        if (code.length >= 8) {
          scannerBufferRef.current = '';
          processBarcode(code);
        }
        return;
      }

      if (/^\d$/.test(e.key)) {
        scannerBufferRef.current += e.key;
        if (scannerTimeoutRef.current) clearTimeout(scannerTimeoutRef.current);
        scannerTimeoutRef.current = setTimeout(() => {
          scannerBufferRef.current = '';
        }, 1000);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text');
      if (text && /^\d{8,14}$/.test(text.trim())) {
        processBarcode(text.trim());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [adminProducts, adminCategories, searchProductExternal]);

  const handleSort = (key: SortKey, isMulti: boolean) => {
    setSortConfigs(prev => {
      const existing = prev.find(c => c.key === key);
      let nextDirection: 'asc' | 'desc' | null = 'asc';
      if (existing) {
        if (existing.direction === 'asc') nextDirection = 'desc';
        else nextDirection = null;
      }
      const newConfig: SortConfig = { key, direction: nextDirection || 'asc' };
      if (isMulti) {
        const filtered = prev.filter(c => c.key !== key);
        return nextDirection ? [...filtered, newConfig] : filtered;
      }
      return nextDirection ? [newConfig] : [];
    });
  };

  const sortedProducts = useMemo(() => {
    let result = [...adminProducts];
    result = result.filter(p => {
      const matchCat = activeTab === 'all' || p.categoryId === activeTab;
      const q = searchQuery.toLowerCase();
      const matchSearch = p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(searchQuery));
      return matchCat && matchSearch;
    });
    if (sortConfigs.length > 0) {
      result.sort((a, b) => {
        for (const config of sortConfigs) {
          let valA: any = a[config.key as keyof Product] ?? '';
          let valB: any = b[config.key as keyof Product] ?? '';
          if (config.key === 'stock') { valA = a.stock ?? 0; valB = b.stock ?? 0; }
          if (valA < valB) return config.direction === 'asc' ? -1 : 1;
          if (valA > valB) return config.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return result;
  }, [adminProducts, activeTab, searchQuery, sortConfigs]);

  const allSelected = sortedProducts.length > 0 && sortedProducts.every(p => selectedIds.includes(p.id));
  const toggleSelect = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelectedIds(allSelected ? [] : sortedProducts.map(p => p.id));

  const openProductModal = (mode: 'new' | 'edit', product?: Product) => {
    if (mode === 'edit' && product) {
      setProductForm({
        id: product.id, name: product.name, brand: product.brand || '', categoryId: product.categoryId,
        price: product.price.toString(), image: product.image || '', format: product.format || '',
        badge: product.badge || '', originalPrice: product.originalPrice?.toString() || '',
        stock: (product.stock ?? 0).toString(),
        minStock: (product.minStock ?? 15).toString(),
        barcode: product.barcode || ''
      });
    } else {
      setProductForm({
        id: '', name: '', brand: '', categoryId: adminCategories[0]?.id || 'almacen',
        price: '', image: '', format: '', badge: '', originalPrice: '',
        stock: '0', minStock: '15', barcode: ''
      });
    }
    setBarcodeError(null);
    setShowProductModal({ show: true, mode, product });
  };

  const handleSaveProduct = async () => {
    // Validar unicidad del barcode
    if (productForm.barcode) {
      const existing = findProductByBarcode(productForm.barcode);
      if (existing && existing.id !== productForm.id) {
        setBarcodeError(`¡Error! El código de barras "${productForm.barcode}" ya está asignado a: ${existing.name}`);
        return;
      }
    }
    setBarcodeError(null);
    const stockVal = parseInt(productForm.stock) || 0;
    const data: any = {
      ...(showProductModal.mode === 'edit' ? { id: productForm.id } : {}),
      name: productForm.name, brand: productForm.brand, categoryId: productForm.categoryId,
      price: parseInt(productForm.price) || 0, image: productForm.image, format: productForm.format,
      badge: productForm.badge, originalPrice: productForm.originalPrice ? parseInt(productForm.originalPrice) : undefined,
      minStock: productForm.minStock !== '' ? parseInt(productForm.minStock) : 15,
      barcode: productForm.barcode || undefined,
      stock: stockVal
    };
    
    if (showProductModal.mode === 'edit') {
      await updateProduct(data.id, data);
    } else {
      await addProduct(data);
    }
    
    setShowProductModal({ show: false, mode: 'new' });
  };

  const getProductCountByCat = (catId: string) => adminProducts.filter(p => p.categoryId === catId).length;
  const getProductCountByTag = (tagName: string) => adminProducts.filter(p => p.badge === tagName).length;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingFile(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => processImportedData(results.data)
        });
      } else if (extension === 'xlsx' || extension === 'xls') {
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        processImportedData(data);
      }
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const processImportedData = (rawData: any[]) => {
    const valid: any[] = [];
    const errors: any[] = [];
    const duplicates: any[] = [];
    const incomplete: any[] = [];

    const seenBarcodes = new Set();
    const dbBarcodes = new Set(adminProducts.map(p => p.barcode).filter(Boolean));

    rawData.forEach((row, index) => {
      // Normalizar las keys de la fila para búsqueda insensible a mayúsculas/acentos
      const normalizedRow: any = {};
      Object.keys(row).forEach(key => {
        const normalizedKey = key.toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar acentos
          .trim();
        normalizedRow[normalizedKey] = row[key];
      });

      const getVal = (paths: string[]) => {
        for (const p of paths) {
          if (normalizedRow[p] !== undefined && normalizedRow[p] !== null) return normalizedRow[p];
        }
        return '';
      };

      const item: any = {
        barcode: getVal(['barcode', 'codigo de barras', 'codigo', 'ean', 'upc']).toString().replace(/\./g, '').trim(),
        name: getVal(['productos', 'producto', 'nombre', 'name', 'articulo']).toString().trim(),
        brand: getVal(['marca', 'brand', 'laboratorio']).toString().trim(),
        category: getVal(['categoria', 'category', 'rubro', 'seccion']).toString().trim(),
        price: getVal(['precio', 'price', 'costo', 'valor']),
        stock: getVal(['stock', 'inventario', 'cantidad', 'existencia']) || 0,
        image: getVal(['image', 'foto', 'url', 'imagen']) || '',
        description: getVal(['descripcion', 'description', 'detalle']) || ''
      };

      // Validar campos obligatorios
      if (item.name === '' || item.price === '' || item.category === '') {
        incomplete.push({ ...item, row: index + 2, reason: 'Campos obligatorios faltantes (Nombre, Precio o Categoría)' });
        return;
      }

      // Validar tipos de datos
      const priceNum = parseFloat(item.price.toString().replace(',', '.'));
      const stockNum = parseInt(item.stock.toString()) || 0;
      if (isNaN(priceNum) || priceNum < 0) {
        errors.push({ ...item, row: index + 2, reason: 'Precio inválido' });
        return;
      }

      // Validar duplicados (barcode)
      if (item.barcode) {
        if (seenBarcodes.has(item.barcode) || dbBarcodes.has(item.barcode)) {
          duplicates.push({ ...item, row: index + 2, reason: 'Código de barras duplicado' });
          return;
        }
        seenBarcodes.add(item.barcode);
      }

      valid.push({
        ...item,
        price: priceNum,
        stock: stockNum,
        id: 'p_imp_' + Date.now() + '_' + index
      });
    });

    setImportData({ valid, errors, duplicates, incomplete });
    setShowImportReview(true);
    setIsProcessingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const discardImportRow = (type: keyof typeof importData, id: string | number) => {
    setImportData(prev => ({
      ...prev,
      [type]: prev[type].filter((item: any) => (item.id || item.row) !== id)
    }));
  };

  const handleConfirmImport = async () => {
    const newProducts: any[] = importData.valid.map(item => {
      // Mapear categoría
      const cat = adminCategories.find(c =>
        c.id.toLowerCase() === item.category.toLowerCase() ||
        c.title.toLowerCase() === item.category.toLowerCase()
      );

      return {
        name: item.name,
        brand: item.brand,
        categoryId: cat?.id || adminCategories[0]?.id || 'almacen',
        price: item.price,
        image: item.image || 'https://images.unsplash.com/photo-1588964895597-cfccd6e2dbf9?q=80&w=200&auto=format&fit=crop',
        format: '',
        barcode: item.barcode || undefined,
        stock: item.stock
      };
    });

    await bulkAddProducts(newProducts);
    setShowImportReview(false);
    setImportData({ valid: [], errors: [], duplicates: [], incomplete: [] });
  };

  const handleExportCSV = () => {
    const headers = ['Código de Barras', 'Producto', 'Marca', 'Categoría', 'Precio', 'Stock'];
    const rows = sortedProducts.map(p => [
      p.barcode || '',
      `"${p.name}"`,
      `"${p.brand}"`,
      `"${adminCategories.find(c => c.id === p.categoryId)?.title || p.categoryId}"`,
      p.price,
      p.stock ?? 0
    ]);

    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `inventario_la_martina_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10 w-full overflow-hidden">
      <h1 className="text-2xl md:text-3xl font-black text-on-background tracking-tight">Inventario</h1>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".csv,.xlsx,.xls"
        className="hidden"
      />
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar { scrollbar-width: thin; scrollbar-color: #e2e8f0 transparent; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Header Bar Portal */}
      {portalTarget && (employeeProfile?.role === 'super_admin' || employeeProfile?.role === 'owner' || employeeProfile?.role === 'admin') && createPortal(
        <div className="flex items-center gap-3 ml-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-6 py-2.5 rounded-full transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">upload</span>
            Importar
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-white hover:bg-surface-container-low text-on-surface-variant font-bold px-6 py-2.5 rounded-full border border-outline-variant/20 transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Exportar
          </button>
        </div>,
        portalTarget
      )}

      {/* Category Bar - ALTURA UNIFICADA h-12 (48px) */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        {/* Desktop Category Bar */}
        <div
          ref={categoryScrollRef}
          className="hidden md:flex bg-white p-1 rounded-2xl shadow-sm border border-outline-variant/10 overflow-x-auto max-w-full hide-scrollbar h-15 items-center"
        >
          <button onClick={() => setActiveTab('all')} className={`h-full px-5 rounded-xl text-base font-bold transition-all whitespace-nowrap flex items-center ${activeTab === 'all' ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:bg-surface-container-low'}`}>
            Todos ({adminProducts.length})
          </button>
          {adminCategories.map(cat => (
            <button key={cat.id} onClick={() => setActiveTab(cat.id)} className={`h-full px-5 rounded-xl text-base font-bold transition-all whitespace-nowrap flex items-center ${activeTab === cat.id ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:bg-surface-container-low'}`}>
              {cat.title} ({getProductCountByCat(cat.id)})
            </button>
          ))}
        </div>

        {/* Mobile Category Grid (Solo Celular) */}
        <div className="flex md:hidden flex-col gap-2 w-full bg-white p-2 rounded-2xl shadow-sm border border-outline-variant/10">
          {/* Fila 1: "Todos" arriba al medio */}
          <div className="flex justify-center w-full">
            <button
              onClick={() => setActiveTab('all')}
              className={`w-2/3 py-2 rounded-xl text-sm font-bold transition-all text-center flex items-center justify-center ${
                activeTab === 'all'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-on-surface-variant hover:bg-surface-container-low border border-outline-variant/10'
              }`}
            >
              Todos ({adminProducts.length})
            </button>
          </div>

          {/* Fila 2: Los 3 primeros */}
          <div className="grid grid-cols-3 gap-2 w-full">
            {adminCategories.slice(0, 3).map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center truncate ${
                  activeTab === cat.id
                    ? 'bg-primary text-white shadow-md'
                    : 'text-on-surface-variant hover:bg-surface-container-low border border-outline-variant/10'
                }`}
              >
                <span className="truncate">{cat.title} ({getProductCountByCat(cat.id)})</span>
              </button>
            ))}
          </div>

          {/* Fila 3: Los últimos 3 */}
          <div className="grid grid-cols-3 gap-2 w-full">
            {adminCategories.slice(3, 6).map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center truncate ${
                  activeTab === cat.id
                    ? 'bg-primary text-white shadow-md'
                    : 'text-on-surface-variant hover:bg-surface-container-low border border-outline-variant/10'
                }`}
              >
                <span className="truncate">{cat.title} ({getProductCountByCat(cat.id)})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 w-full lg:w-auto h-15">
          <button onClick={() => setShowManageModal({ show: true, type: 'category' })} className="h-full w-12 bg-white text-on-surface-variant rounded-2xl flex items-center justify-center border border-outline-variant/20 hover:bg-surface-container-low transition-all shadow-sm shrink-0">
            <span className="material-symbols-outlined text-[22px]">settings</span>
          </button>
          <button onClick={() => setShowManageModal({ show: true, type: 'tag' })} className="h-full flex items-center gap-2 px-3 rounded-2xl bg-white text-on-surface-variant font-bold text-xs border border-outline-variant/20 hover:bg-surface-container-low shadow-sm whitespace-nowrap">
            <span className="material-symbols-outlined text-[15px]">label</span>
          </button>
          <PermissionGuard permission="products.create">
            <button onClick={() => openProductModal('new')} className="h-full flex-1 lg:flex-none bg-primary text-white font-bold px-8 rounded-2xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 text-sm whitespace-nowrap">
              <span className="material-symbols-outlined text-[20px]">add</span> Nuevo
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center justify-between animate-in slide-in-from-top-2">
          <p className="text-sm font-bold text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">check_circle</span>
            {selectedIds.length} seleccionados
          </p>
          <div className="flex gap-2">
            <PermissionGuard permission="products.change_price">
              <button onClick={() => setShowBulkModal(true)} className="bg-primary text-white font-bold px-4 py-2 rounded-xl text-xs hover:bg-primary/90 shadow-md">Ajuste %</button>
            </PermissionGuard>
            <button onClick={() => setSelectedIds([])} className="bg-white text-on-surface-variant font-bold text-xs px-4 py-2 rounded-xl border border-outline-variant/20">Limpiar</button>
          </div>
        </div>
      )}

      {productsError && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 flex items-start gap-3 mt-4 animate-in slide-in-from-top-2">
          <span className="material-symbols-outlined text-red-600 shrink-0">error</span>
          <div>
            <p className="font-bold text-sm">Error en la base de datos de Supabase</p>
            <p className="text-xs text-red-700 mt-1">{productsError}</p>
          </div>
        </div>
      )}

      {/* Table Card */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-outline-variant/5 overflow-hidden w-full mt-4">
        <div className="p-5 border-b border-outline-variant/10 flex flex-col md:flex-row justify-between gap-4 items-center">
          <div className="relative flex-1 max-w-sm w-full">
            <input type="text" placeholder="Buscar por nombre, marca o código de barras..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-surface-container-low border-none rounded-2xl px-5 py-3 pl-11 w-full text-sm outline-none focus:ring-2 ring-primary/10 transition-all" />
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
          </div>
          <div className="flex items-center gap-2">
            {isSearchingExternal ? (
              <span className="text-[9px] font-bold text-primary uppercase tracking-widest bg-primary/5 px-3 py-2 rounded-xl flex items-center gap-1.5 animate-pulse">
                <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                Buscando en base de datos global...
              </span>
            ) : scannerActive && (
              <span className="text-[9px] font-bold text-green-600 uppercase tracking-widest bg-green-50 px-3 py-2 rounded-xl flex items-center gap-1.5 animate-pulse">
                <span className="material-symbols-outlined text-[14px]">barcode_scanner</span>
                ¡Escaneado!
              </span>
            )}
            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest bg-surface-container-low px-4 py-2 rounded-xl flex items-center gap-2">
              <span className="material-symbols-outlined text-[12px]">barcode_scanner</span>
              Scanner activo
            </span>
          </div>
        </div>
        <div className="w-full overflow-hidden hidden md:block">
          <table className="w-full text-left table-auto border-collapse">
            <thead>
              <tr className="bg-surface-container-lowest text-[11px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                <th className="px-8 py-5 w-10 text-center">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-primary w-4 h-4 cursor-pointer" />
                </th>
                <th className="px-8 py-5 text-on-surface-variant/70">Producto</th>
                {([
                  { key: 'categoryId', label: 'Categoría', width: '200px' },
                  { key: 'stock', label: 'Stock', width: '140px' },
                  { key: 'price', label: 'Precio', width: '160px' }
                ] as const).map(col => {
                  const sort = sortConfigs.find(c => c.key === col.key);
                  return (
                    <th
                      key={col.key}
                      onClick={(e) => handleSort(col.key, e.shiftKey)}
                      className="px-8 py-5 cursor-pointer select-none group"
                      style={{ width: col.width }}
                    >
                      <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl group-hover:bg-surface-container-low transition-all duration-200">
                        <span className="group-hover:text-primary transition-colors">{col.label}</span>
                        <span className={`material-symbols-outlined text-[16px] transition-all ${sort ? 'text-primary opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                          {sort?.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th className="px-8 py-5 w-[120px] text-center text-on-surface-variant/70">Gestión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-sm">
              {productsLoading && sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-16 text-center text-on-surface-variant">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span>
                      <p className="font-bold">Cargando productos desde Supabase...</p>
                    </div>
                  </td>
                </tr>
              ) : sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-16 text-center text-on-surface-variant">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">inventory_2</span>
                      <p className="font-bold">No se encontraron productos</p>
                      <p className="text-xs text-on-surface-variant/60">
                        {productsError ? 'Ocurrió un error al conectar con Supabase. Revisa el banner de arriba.' : 'Agrega un nuevo producto para comenzar.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedProducts.map(product => {
                  const stock = product.stock ?? 0;
                  const checked = selectedIds.includes(product.id);
                  return (
                    <tr key={product.id} className={`transition-colors ${checked ? 'bg-primary/[0.03]' : 'hover:bg-surface-container-lowest'}`}>
                      <td className="px-8 py-4 text-center"><input type="checkbox" checked={checked} onChange={() => toggleSelect(product.id)} className="accent-primary w-4 h-4 cursor-pointer" /></td>
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-12 h-12 bg-surface-container-low rounded-xl p-1.5 shrink-0 flex items-center justify-center">
                            <img src={product.image} alt="" className="w-full h-full object-contain mix-blend-multiply" />
                          </div>
                          <div className="flex flex-col min-w-0 pr-2">
                            <p className="font-bold text-on-background text-[15px] leading-tight whitespace-normal break-words">{product.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-[10px] text-on-surface-variant font-black uppercase tracking-wider bg-surface-container-low px-1.5 py-0.5 rounded-md truncate">{product.brand}</p>
                              {product.barcode && (
                                <span className="text-[9px] text-on-surface-variant/40 font-mono font-medium">#{product.barcode}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        <span className="bg-surface-container-low px-3 py-1.5 rounded-lg text-[10px] font-black text-on-surface-variant uppercase tracking-wider whitespace-nowrap border border-outline-variant/10">
                          {adminCategories.find(c => c.id === product.categoryId)?.title || product.categoryId}
                        </span>
                      </td>
                      <td className="px-8 py-4">
                        <div className="flex flex-col">
                          <span className={`font-black text-base ${stock === 0 ? 'text-error' : stock < (product.minStock ?? 20) ? 'text-orange-500' : 'text-on-background'}`}>
                            {stock}
                          </span>
                          {stock < (product.minStock ?? 20) && stock > 0 && (
                            <span className="text-[9px] font-black text-orange-400 uppercase tracking-tighter leading-none mt-0.5">Bajo Stock</span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-4 font-black text-primary text-lg whitespace-nowrap tracking-tight">${formatCurrency(product.price)}</td>
                      <td className="px-8 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <PermissionGuard permission="products.update">
                            <button onClick={() => openProductModal('edit', product)} className="w-10 h-10 rounded-xl flex items-center justify-center bg-white border border-outline-variant/10 text-on-surface-variant hover:bg-primary hover:text-white transition-all shadow-sm">
                              <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                          </PermissionGuard>
                          <PermissionGuard permission="products.delete">
                            <button onClick={() => setDeleteConfirm({ id: product.id, type: 'product' })} className="w-10 h-10 rounded-xl flex items-center justify-center bg-white border border-outline-variant/10 text-on-surface-variant hover:bg-error hover:text-white transition-all shadow-sm">
                              <span className="material-symbols-outlined text-[20px]">delete</span>
                            </button>
                          </PermissionGuard>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Product List (Solo Celular) */}
        <div className="block md:hidden divide-y divide-outline-variant/10">
          {productsLoading && sortedProducts.length === 0 ? (
            <div className="px-6 py-16 text-center text-on-surface-variant">
              <div className="flex flex-col items-center justify-center gap-3">
                <span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span>
                <p className="font-bold text-sm">Cargando productos...</p>
              </div>
            </div>
          ) : sortedProducts.length === 0 ? (
            <div className="px-6 py-16 text-center text-on-surface-variant">
              <div className="flex flex-col items-center justify-center gap-3">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">inventory_2</span>
                <p className="font-bold text-sm">No se encontraron productos</p>
              </div>
            </div>
          ) : (
            sortedProducts.map(product => {
              return (
                <div key={product.id} className="p-4 flex items-center justify-between gap-3 hover:bg-surface-container-lowest transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Botón de Edición (Lápiz) */}
                    <PermissionGuard permission="products.update">
                      <button
                        onClick={() => openProductModal('edit', product)}
                        className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/5 text-primary hover:bg-primary hover:text-white border border-primary/10 active:scale-95 transition-all shadow-sm shrink-0"
                      >
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                    </PermissionGuard>

                    {/* Miniatura de Imagen */}
                    {product.image && (
                      <div className="w-10 h-10 bg-surface-container-low rounded-xl p-1.5 shrink-0 flex items-center justify-center border border-outline-variant/5">
                        <img src={product.image} alt="" className="w-full h-full object-contain mix-blend-multiply" />
                      </div>
                    )}

                    {/* Nombre */}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-on-background text-sm leading-snug break-words">{product.name}</p>
                    </div>
                  </div>

                  {/* Precio */}
                  <div className="text-right shrink-0">
                    <p className="font-black text-primary text-base tracking-tight">${formatCurrency(product.price)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modales - Se mantienen pero compactos */}
      {showProductModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowProductModal({ show: false, mode: 'new' })} />
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl relative z-10 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur-md z-20">
              <h3 className="text-xl font-bold">{showProductModal.mode === 'edit' ? 'Editar' : 'Nuevo'} Producto</h3>
              <button onClick={() => setShowProductModal({ show: false, mode: 'new' })} className="material-symbols-outlined">close</button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex flex-col items-center bg-surface-container-lowest rounded-3xl p-6 border border-dashed border-outline-variant/20">
                <img src={productForm.image} alt="" className="w-32 h-32 object-contain mb-4 bg-white rounded-xl p-2" />
                <input type="text" value={productForm.image} onChange={e => setProductForm({ ...productForm, image: e.target.value })} className="w-full max-w-sm bg-white rounded-xl px-4 py-2 text-[10px] outline-none border border-outline-variant/20 text-center" placeholder="Link de imagen..." />
              </div>
              {/* Código de Barras */}
              <div className="bg-surface-container-lowest rounded-2xl p-4 border border-outline-variant/10">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block mb-2">Código de Barras</label>
                <input type="text" value={productForm.barcode} onChange={e => { setProductForm({...productForm, barcode: e.target.value}); setBarcodeError(null); }} className="w-full bg-surface-container-low border border-outline-variant/10 rounded-xl px-4 py-3 font-bold outline-none focus:border-primary" placeholder="Escanear o escribir..." />
                {barcodeError && <p className="text-error text-[10px] font-bold mt-1 animate-in shake duration-300">{barcodeError}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input type="text" value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} placeholder="Nombre" className="bg-surface-container-low rounded-xl px-4 py-3 font-bold" />
                <input type="text" value={productForm.brand} onChange={e => setProductForm({ ...productForm, brand: e.target.value })} placeholder="Marca" className="bg-surface-container-low rounded-xl px-4 py-3 font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <select value={productForm.categoryId} onChange={e => setProductForm({ ...productForm, categoryId: e.target.value })} className="bg-surface-container-low rounded-xl px-4 py-3 font-bold">
                  {adminCategories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <select value={productForm.badge} onChange={e => setProductForm({ ...productForm, badge: e.target.value })} className="bg-surface-container-low rounded-xl px-4 py-3 font-bold">
                  <option value="">Sin etiqueta</option>
                  {adminTags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block ml-1">Precio *</label>
                    <input type="number" value={productForm.price} onChange={e => setProductForm({ ...productForm, price: e.target.value })} className="w-full bg-surface-container-low rounded-xl px-4 py-3 outline-none font-bold text-primary" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block ml-1">Formato</label>
                    <input type="text" value={productForm.format} onChange={e => setProductForm({ ...productForm, format: e.target.value })} className="w-full bg-surface-container-low rounded-xl px-4 py-3 outline-none" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block ml-1">Stock Actual</label>
                    <input type="number" value={productForm.stock} onChange={e => setProductForm({ ...productForm, stock: e.target.value })} className="w-full bg-surface-container-low rounded-xl px-4 py-3 outline-none font-bold" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 block ml-1 text-orange-600">Avisar con menos de:</label>
                    <input type="number" value={productForm.minStock} onChange={e => setProductForm({ ...productForm, minStock: e.target.value })} className="w-full bg-orange-50/50 rounded-xl px-4 py-3 outline-none font-bold text-orange-600 border border-orange-200" />
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-outline-variant/10 flex gap-4">
              <button onClick={() => setShowProductModal({ show: false, mode: 'new' })} className="flex-1 font-bold">Cancelar</button>
              <button onClick={handleSaveProduct} className="flex-[2] bg-primary text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/20">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ajuste en Masa */}
      {showBulkModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowBulkModal(false)} />
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl relative z-10 animate-in zoom-in-95 duration-300 p-8 text-center">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-4xl">percent</span>
            </div>
            <h3 className="text-xl font-bold mb-2">Ajuste de Precios</h3>
            <p className="text-on-surface-variant text-sm mb-6">Se aplicará un aumento o descuento a los {selectedIds.length} productos seleccionados.</p>

            <div className="relative mb-6">
              <input
                type="number"
                value={bulkPercent}
                onChange={e => setBulkPercent(e.target.value)}
                placeholder="Ej: 15 o -10"
                className="w-full bg-surface-container-low rounded-2xl px-6 py-4 text-center text-2xl font-bold outline-none border-2 border-transparent focus:border-primary transition-all"
              />
              <span className="absolute right-6 top-1/2 -translate-y-1/2 text-2xl font-bold text-on-surface-variant">%</span>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  bulkUpdatePrice(selectedIds, parseFloat(bulkPercent) || 0);
                  setShowBulkModal(false);
                  setSelectedIds([]);
                  setBulkPercent('');
                }}
                className="w-full bg-primary text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
              >
                Aplicar Ajuste
              </button>
              <button onClick={() => setShowBulkModal(false)} className="w-full py-3 font-bold text-on-surface-variant hover:text-on-surface transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gestión (Compacto) */}
      {showManageModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowManageModal({ show: false, type: 'category' })} />
          <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl relative z-10 animate-in zoom-in-95 duration-300 p-6">
            <h3 className="font-bold mb-4">Gestionar {showManageModal.type === 'category' ? 'Categorías' : 'Etiquetas'}</h3>
            <div className="flex gap-2 mb-4">
              <input type="text" value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Nuevo..." className="flex-1 bg-surface-container-low rounded-xl px-4 py-2 outline-none" />
              <button onClick={() => { if (!newItemName) return; if (showManageModal.type === 'category') addCategory({ id: newItemName.toLowerCase().replace(/ /g, '-'), title: newItemName, description: '' }); else addTag(newItemName); setNewItemName(''); }} className="bg-primary text-white p-2 rounded-xl"><span className="material-symbols-outlined">add</span></button>
            </div>
            <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2">
              {(showManageModal.type === 'category' ? adminCategories : adminTags).map((item: any) => (
                <div key={typeof item === 'string' ? item : item.id} className="flex justify-between items-center bg-surface-container-low p-3 rounded-xl group">
                  <span className="font-bold text-xs">{typeof item === 'string' ? item : item.title}</span>
                  <button onClick={() => setDeleteConfirm({ id: typeof item === 'string' ? item : item.id, type: showManageModal.type })} className="text-error opacity-0 group-hover:opacity-100"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmación Eliminación */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="bg-white w-full max-w-xs rounded-[2.5rem] p-8 text-center relative z-10 animate-in zoom-in-95">
            <div className="w-14 h-14 bg-error/10 text-error rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl">warning</span>
            </div>
            <h4 className="font-bold mb-6">¿Confirmar eliminación?</h4>
            <div className="flex flex-col gap-2">
              <button onClick={() => { if (deleteConfirm.type === 'product') deleteProduct(deleteConfirm.id); else if (deleteConfirm.type === 'category') deleteCategory(deleteConfirm.id); else deleteTag(deleteConfirm.id); setDeleteConfirm(null); }} className="w-full bg-error text-white font-bold py-3 rounded-xl">Eliminar</button>
              <button onClick={() => setDeleteConfirm(null)} className="w-full py-3 font-bold text-on-surface-variant">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Revisión de Importación */}
      {showImportReview && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowImportReview(false)} />
          <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl relative z-10 animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-8 border-b border-outline-variant/10 flex justify-between items-center bg-white z-20">
              <div>
                <h3 className="text-2xl font-black">Revisar Importación</h3>
                <p className="text-sm text-on-surface-variant mt-1">Analizamos tu archivo. Revisá los resultados antes de guardar.</p>
              </div>
              <button onClick={() => setShowImportReview(false)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container-low transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              {/* Resumen */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-green-50 border border-green-100 p-4 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-1">Válidos</p>
                  <p className="text-2xl font-black text-green-600">{importData.valid.length}</p>
                </div>
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-red-700 uppercase tracking-widest mb-1">Errores</p>
                  <p className="text-2xl font-black text-red-600">{importData.errors.length}</p>
                </div>
                <div className="bg-orange-50 border border-orange-100 p-4 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-orange-700 uppercase tracking-widest mb-1">Duplicados</p>
                  <p className="text-2xl font-black text-orange-600">{importData.duplicates.length}</p>
                </div>
                <div className="bg-surface-container-low border border-outline-variant/10 p-4 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Incompletos</p>
                  <p className="text-2xl font-black">{importData.incomplete.length}</p>
                </div>
              </div>

              {/* Tablas de resultados */}
              <div className="space-y-8">
                {importData.valid.length > 0 && (
                  <div>
                    <h4 className="font-bold text-sm mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Productos Listos para Importar ({importData.valid.length})
                    </h4>
                    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-surface-container-low font-bold">
                          <tr>
                            <th className="px-4 py-3">Nombre</th>
                            <th className="px-4 py-3">Marca</th>
                            <th className="px-4 py-3">Categoría</th>
                            <th className="px-4 py-3 text-right">Precio</th>
                            <th className="px-4 py-3 text-right">Stock</th>
                            <th className="px-4 py-3">Código</th>
                            <th className="px-4 py-3 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/5">
                          {importData.valid.slice(0, 10).map((p, i) => (
                            <tr key={i}>
                              <td className="px-4 py-3 font-bold">{p.name}</td>
                              <td className="px-4 py-3 text-on-surface-variant">{p.brand}</td>
                              <td className="px-4 py-3"><span className="bg-surface-container-low px-2 py-0.5 rounded text-[9px] font-black">{p.category}</span></td>
                              <td className="px-4 py-3 text-right font-black text-primary">${p.price}</td>
                              <td className="px-4 py-3 text-right font-black">{p.stock}</td>
                              <td className="px-4 py-3 font-mono text-[10px] text-on-surface-variant">#{p.barcode}</td>
                              <td className="px-4 py-3 text-right">
                                <button onClick={() => discardImportRow('valid', p.id)} className="text-on-surface-variant hover:text-error transition-colors">
                                  <span className="material-symbols-outlined text-[18px]">close</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {importData.valid.length > 10 && (
                        <div className="p-3 text-center bg-surface-container-lowest text-[10px] text-on-surface-variant italic">
                          Y {importData.valid.length - 10} productos más...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(importData.errors.length > 0 || importData.duplicates.length > 0 || importData.incomplete.length > 0) && (
                  <div>
                    <h4 className="font-bold text-sm mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                      Problemas Encontrados ({importData.errors.length + importData.duplicates.length + importData.incomplete.length})
                    </h4>
                    <div className="bg-red-50/30 border border-red-100 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-red-50 font-bold text-red-700">
                          <tr>
                            <th className="px-4 py-3">Fila</th>
                            <th className="px-4 py-3">Producto</th>
                            <th className="px-4 py-3">Motivo del Error</th>
                            <th className="px-4 py-3 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-red-100/50">
                          {([
                            ...importData.errors.map(e => ({ ...e, type: 'errors' })),
                            ...importData.duplicates.map(e => ({ ...e, type: 'duplicates' })),
                            ...importData.incomplete.map(e => ({ ...e, type: 'incomplete' }))
                          ] as any[]).slice(0, 50).map((p, i) => (
                            <tr key={i}>
                              <td className="px-4 py-3 font-mono font-bold text-red-600">#{p.row}</td>
                              <td className="px-4 py-3 font-bold">{p.name || '---'}</td>
                              <td className="px-4 py-3">
                                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                                  {p.reason}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button onClick={() => discardImportRow(p.type, p.row)} className="text-on-surface-variant hover:text-error transition-colors">
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-8 border-t border-outline-variant/10 bg-surface-container-lowest flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="text-sm font-medium text-on-surface-variant">
                Se importarán <span className="font-black text-on-background">{importData.valid.length}</span> productos válidos.
              </div>
              <div className="flex gap-4 w-full md:w-auto">
                <button
                  onClick={() => setShowImportReview(false)}
                  className="flex-1 md:flex-none px-8 py-3 font-bold text-on-surface-variant hover:bg-surface-container-low rounded-2xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importData.valid.length === 0}
                  className="flex-1 md:flex-none bg-primary text-white font-bold px-12 py-4 rounded-2xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:grayscale"
                >
                  Confirmar y Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Indicador de procesamiento */}
      {isProcessingFile && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center">
            <span className="material-symbols-outlined text-5xl text-primary animate-spin mb-4">sync</span>
            <p className="font-black">Procesando archivo...</p>
            <p className="text-xs text-on-surface-variant mt-1">Esto puede demorar unos segundos para listas grandes.</p>
          </div>
        </div>
      )}
    </div>
  );
};

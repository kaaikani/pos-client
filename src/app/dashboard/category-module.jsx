"use client";
import React, { useState, useEffect } from 'react';
import { Search, ArrowLeft, Loader2, AlertTriangle, PlusCircle, LayoutGrid, CheckCircle, ChevronDown, Plus, XCircle, Pencil, Trash2, Package, IndianRupee, Save } from 'lucide-react';
import { gql } from '../../core/queries/gql';
import { GetPosCategoriesQuery, GetPosProductsQuery, invalidateProductsCache, invalidateCategoriesCache } from '../../core/queries/PosQueries';

// ── Vendure Product CRUD via Admin API ──
async function createVendureProduct(input) {
    // 1. Create product
    const prodRes = await gql(`
        mutation CreateProduct($input: CreateProductInput!) {
            createProduct(input: $input) { id name }
        }
    `, { useAdmin: true, variables: { input: { translations: [{ languageCode: "en", name: input.name, slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: input.description || input.name }] } } });
    const productId = prodRes.createProduct.id;

    // 2. Create variant(s)
    const variants = input.variants && input.variants.length > 0 ? input.variants : [{ name: input.name, price: input.price, sku: input.sku || '' }];
    for (const v of variants) {
        await gql(`
            mutation CreateVariant($input: [CreateProductVariantInput!]!) {
                createProductVariants(input: $input) { id name price sku }
            }
        `, {
            useAdmin: true,
            variables: {
                input: [{
                    productId,
                    translations: [{ languageCode: "en", name: v.name }],
                    price: Math.round((v.price || 0) * 100),
                    sku: v.sku || `SKU-${Date.now()}-${Math.floor(Math.random()*1000)}`,
                    trackInventory: "FALSE",
                    stockOnHand: 999,
                }]
            }
        });
    }

    // 3. Assign to collection via collection filter
    if (input.collectionId) {
        try {
            // Fetch current collection filters first
            const colData = await gql(`
                query GetCol($id: ID!) {
                    collection(id: $id) { id filters { code args { name value } } }
                }
            `, { useAdmin: true, variables: { id: input.collectionId } });

            const existing = colData?.collection?.filters || [];
            const pidFilter = existing.find(f => f.code === 'product-id-collection-filter');
            let productIds = [];
            if (pidFilter) {
                const idsArg = pidFilter.args.find(a => a.name === 'productIds');
                if (idsArg) productIds = JSON.parse(idsArg.value);
            }
            if (!productIds.includes(productId)) productIds.push(productId);

            const filters = [
                ...existing.filter(f => f.code !== 'product-id-collection-filter').map(f => ({
                    code: f.code, arguments: f.args.map(a => ({ name: a.name, value: a.value }))
                })),
                { code: 'product-id-collection-filter', arguments: [{ name: 'productIds', value: JSON.stringify(productIds) }] }
            ];

            await gql(`
                mutation UpdateCol($input: UpdateCollectionInput!) {
                    updateCollection(input: $input) { id }
                }
            `, { useAdmin: true, variables: { input: { id: input.collectionId, filters } } });
        } catch (e) {
            console.warn('Collection assignment failed:', e);
        }
    }

    return productId;
}

async function updateVendureVariant(variantId, updates) {
    const input = { id: variantId };
    if (updates.name !== undefined) input.translations = [{ languageCode: "en", name: updates.name }];
    if (updates.price !== undefined) input.price = Math.round(updates.price * 100);
    if (updates.sku !== undefined) input.sku = updates.sku;
    await gql(`
        mutation UpdateVariant($input: [UpdateProductVariantInput!]!) {
            updateProductVariants(input: $input) { id name price sku }
        }
    `, { useAdmin: true, variables: { input: [input] } });
}

async function deleteVendureProduct(productId) {
    await gql(`
        mutation DeleteProduct($id: ID!) {
            deleteProduct(id: $id) { result message }
        }
    `, { useAdmin: true, variables: { id: productId } });
}

export default function ProductsModule() {
    const [categories, setCategories] = useState([]);
    const [products, setProducts] = useState([]);
    const [viewState, setViewState] = useState('loading');
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [catSearch, setCatSearch] = useState('');
    const [prodSearch, setProdSearch] = useState('');
    const [addedToast, setAddedToast] = useState(null);
    const [selectedVariants, setSelectedVariants] = useState({});

    // Add Product Modal
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [addForm, setAddForm] = useState({ name: '', price: '', sku: '', description: '' });
    const [addVariants, setAddVariants] = useState([]);
    const [addLoading, setAddLoading] = useState(false);

    // Edit variant inline
    const [editingVariant, setEditingVariant] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', price: '', sku: '' });

    useEffect(() => { fetchInitialData(); }, []);

    const fetchInitialData = async () => {
        try {
            const cats = await new GetPosCategoriesQuery().execute();
            setCategories(cats);
            setViewState('root');
        } catch { setViewState('error'); }
    };

    const loadCategoryDetails = async (cat) => {
        try {
            setViewState('loading');
            setSelectedCategory(cat);
            setProdSearch('');
            const prods = await new GetPosProductsQuery().execute(cat.id);
            setProducts(prods);
            setViewState('detail');
        } catch { setViewState('error'); }
    };

    const refreshProducts = async () => {
        if (!selectedCategory) return;
        invalidateProductsCache(); // force fresh fetch after CRUD
        const prods = await new GetPosProductsQuery().execute(selectedCategory.id);
        setProducts(prods);
    };

    const handleBack = () => { setSelectedCategory(null); setViewState('root'); };

    // ── Add Product ──
    const openAddModal = () => {
        setAddForm({ name: '', price: '', sku: '', description: '' });
        setAddVariants([]);
        setAddModalOpen(true);
    };

    const addVariantRow = () => {
        setAddVariants(prev => [...prev, { name: '', price: '', sku: '' }]);
    };

    const updateVariantRow = (idx, field, val) => {
        setAddVariants(prev => prev.map((v, i) => i === idx ? { ...v, [field]: val } : v));
    };

    const removeVariantRow = (idx) => {
        setAddVariants(prev => prev.filter((_, i) => i !== idx));
    };

    const submitAddProduct = async () => {
        if (!addForm.name.trim()) return alert('Product name is required.');
        const hasVariants = addVariants.length > 0 && addVariants.some(v => v.name.trim());
        if (!hasVariants && !addForm.price) return alert('Price is required when no variants are specified.');

        setAddLoading(true);
        try {
            const variants = hasVariants
                ? addVariants.filter(v => v.name.trim()).map(v => ({
                    name: `${addForm.name.trim()} ${v.name.trim()}`,
                    price: parseFloat(v.price) || 0,
                    sku: v.sku || '',
                }))
                : undefined;

            await createVendureProduct({
                name: addForm.name.trim(),
                description: addForm.description,
                price: parseFloat(addForm.price) || 0,
                sku: addForm.sku,
                collectionId: selectedCategory?.id,
                variants,
            });

            setAddModalOpen(false);
            setAddedToast(`"${addForm.name}" added to Vendure`);
            setTimeout(() => setAddedToast(null), 3000);
            await refreshProducts();
        } catch (err) {
            alert('Failed to add product: ' + err.message);
        }
        setAddLoading(false);
    };

    // ── Edit Variant ──
    const startEdit = (product) => {
        setEditingVariant(product.id);
        setEditForm({ name: product.name + (product.quantityStr && product.quantityStr !== '1 Pc' ? ' ' + product.quantityStr : ''), price: product.price.toString(), sku: product.barcode });
    };

    const saveEdit = async (variantId) => {
        try {
            await updateVendureVariant(variantId, {
                name: editForm.name,
                price: parseFloat(editForm.price) || 0,
                sku: editForm.sku,
            });
            setEditingVariant(null);
            setAddedToast('Product updated in Vendure');
            setTimeout(() => setAddedToast(null), 2500);
            await refreshProducts();
        } catch (err) {
            alert('Update failed: ' + err.message);
        }
    };

    // ── Delete Product ──
    const handleDelete = async (product) => {
        // product.id is variant ID, we need product ID - fetch it
        if (!confirm(`Delete "${product.name}"? This will remove it from Vendure.`)) return;
        try {
            // Get the product ID from variant
            const data = await gql(`query GetVariant($id: ID!) { productVariant(id: $id) { product { id } } }`, { useAdmin: true, variables: { id: product.id } });
            const productId = data.productVariant.product.id;
            await deleteVendureProduct(productId);
            setAddedToast(`"${product.name}" deleted from Vendure`);
            setTimeout(() => setAddedToast(null), 2500);
            await refreshProducts();
        } catch (err) {
            alert('Delete failed: ' + err.message);
        }
    };

    // ── POS Cart ──
    const handleAddToPosCart = (product) => {
        try {
            const raw = localStorage.getItem('pos_cart');
            let cart = raw ? JSON.parse(raw) : [];
            const idx = cart.findIndex(c => c.productId === product.id || c.id === product.id);
            if (idx > -1) { cart[idx].qty += 1; cart[idx].total = cart[idx].qty * cart[idx].rate; }
            else { cart.push({ id: product.id, productId: product.id, code: product.id, name: product.name, qty: 1, rate: product.price, total: product.price }); }
            localStorage.setItem('pos_cart', JSON.stringify(cart));
            setAddedToast(`${product.name} sent to POS`);
            setTimeout(() => setAddedToast(null), 2500);
        } catch (e) { alert("Error adding to POS cart"); }
    };

    // ── Filtering & Grouping ──
    const filteredCategories = categories.filter(c => c.name.toLowerCase().includes(catSearch.toLowerCase()));
    const filteredProducts = products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase()) || p.id.toLowerCase().includes(prodSearch.toLowerCase()));

    const stripSizeSuffix = (name) => {
        const match = name.match(/\s*\b(\d+(?:\.\d+)?)\s*(g|gm|gms|kg|ml|l|ltr|pc|pcs|pk|pack)\b\s*$/i);
        return match ? { base: name.slice(0, match.index).trim(), size: match[0].trim() } : { base: name, size: '' };
    };

    const groupedProducts = [];
    const groupMap = {};
    filteredProducts.forEach(p => {
        const { base, size } = stripSizeSuffix(p.name);
        const productCopy = { ...p, quantityStr: size || p.quantityStr };
        if (!groupMap[base]) groupMap[base] = [];
        groupMap[base].push(productCopy);
    });
    Object.entries(groupMap).forEach(([name, variants]) => {
        const idx = selectedVariants[name] || 0;
        const sorted = [...variants].sort((a, b) => a.price - b.price);
        groupedProducts.push({ name, variants: sorted, selectedIdx: Math.min(idx, sorted.length - 1) });
    });

    // ── Loading ──
    if (viewState === 'loading') {
        return (<div className="flex items-center justify-center h-[85vh] bg-slate-50 rounded-xl border border-slate-200"><Loader2 className="animate-spin text-emerald-500" size={48}/></div>);
    }
    if (viewState === 'error') {
        return (<div className="flex flex-col items-center justify-center h-[85vh] bg-slate-50 rounded-xl border border-slate-200 text-slate-800">
            <AlertTriangle size={64} className="mb-4 text-red-400"/><h2 className="text-xl font-bold">Failed to load data.</h2>
            <button onClick={fetchInitialData} className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-lg">Retry</button>
        </div>);
    }

    return (<div className="flex flex-col h-[85vh] bg-slate-50 rounded-xl overflow-hidden font-sans border border-slate-200 shadow-sm relative">

        {addedToast && (<div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold shadow-xl flex items-center gap-2 border border-slate-700">
            <CheckCircle size={18} className="text-emerald-400"/> {addedToast}
        </div>)}

        {/* ── ROOT VIEW: Categories ── */}
        {viewState === 'root' && (<div className="flex flex-col h-full relative">
            <div className="bg-white p-6 border-b border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2"><Package className="text-emerald-600"/> Products</h1>
                    <p className="text-slate-800 text-sm font-bold mt-1">Select a category to view and manage products.</p>
                </div>
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-3 top-2.5 text-slate-700" size={18}/>
                    <input type="text" value={catSearch} onChange={e => setCatSearch(e.target.value)} placeholder="Search category..." className="w-full pl-10 pr-4 py-2 bg-slate-100 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm text-slate-800"/>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50">
                <div className="grid grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5 gap-6">
                    {filteredCategories.map((c, i) => (<button key={c.id} onClick={() => loadCategoryDetails(c)} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-emerald-300 transition-all flex flex-col items-center justify-center gap-3 group">
                        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl font-black shadow-inner group-hover:scale-110 transition-transform">{i + 1}</div>
                        <h3 className="text-lg font-black text-slate-800 tracking-tight">{c.name}</h3>
                    </button>))}
                    {filteredCategories.length === 0 && (<div className="col-span-full py-20 text-center text-slate-700 font-bold border-2 border-dashed border-slate-300 rounded-2xl bg-white">No categories found</div>)}
                </div>
            </div>
        </div>)}

        {/* ── DETAIL VIEW: Products Table ── */}
        {viewState === 'detail' && (<div className="flex flex-col h-full relative">
            <div className="bg-white p-4 border-b border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 z-10">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2.5 border border-slate-300 text-slate-800 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition shadow-sm"><ArrowLeft size={20}/></button>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                            <Package className="text-emerald-600"/> {selectedCategory?.name}
                        </h1>
                        <p className="text-[11px] font-black text-slate-700 tracking-wider uppercase mt-0.5">{groupedProducts.length} products | {filteredProducts.length} variants</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-2.5 text-slate-700" size={18}/>
                        <input type="text" value={prodSearch} onChange={e => setProdSearch(e.target.value)} placeholder="Search products..." className="w-full pl-10 pr-4 py-2 bg-slate-100 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm text-slate-800"/>
                    </div>
                    <button onClick={openAddModal} className="h-10 px-4 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition flex items-center gap-2 shadow-sm font-bold text-sm shrink-0">
                        <Plus size={16}/> Add Product
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative bg-white">
                <div className="h-full overflow-auto">
                    {filteredProducts.length === 0 ? (<div className="flex flex-col items-center justify-center p-20 text-slate-700 font-bold text-center">
                        <Package size={48} className="mb-4 opacity-30"/><p>No products found. Click "Add Product" to create one.</p>
                    </div>) : (<table className="w-full text-left whitespace-nowrap text-sm border-collapse">
                        <thead className="bg-slate-100 sticky top-0 z-10 text-[11px] uppercase tracking-widest text-slate-800 font-black shadow-sm">
                            <tr>
                                <th className="p-4 border-b border-slate-200">Product Name</th>
                                <th className="p-4 border-b border-slate-200 w-52">Variant / Size</th>
                                <th className="p-4 border-b border-slate-200 w-28">SKU</th>
                                <th className="p-4 border-b border-slate-200 w-32 text-right">Price (₹)</th>
                                <th className="p-4 border-b border-slate-200 w-48 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold">
                            {groupedProducts.map(g => {
                                const selected = g.variants[g.selectedIdx];
                                const isEditing = editingVariant === selected.id;
                                return (<tr key={g.name} className="hover:bg-emerald-50/40 transition-colors group">
                                    <td className="p-4">
                                        {isEditing ? (
                                            <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="border border-emerald-400 rounded-lg px-2 py-1 font-bold text-sm w-full outline-none focus:ring-2 focus:ring-emerald-500"/>
                                        ) : (
                                            <><span className="font-bold text-slate-800 group-hover:text-emerald-700 transition-colors text-base">{g.name}</span>
                                            <span className="text-[10px] text-slate-700 font-bold ml-2">({g.variants.length} variant{g.variants.length > 1 ? 's' : ''})</span></>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        {g.variants.length > 1 ? (<div className="relative">
                                            <select value={g.selectedIdx} onChange={e => { e.stopPropagation(); setSelectedVariants(prev => ({ ...prev, [g.name]: parseInt(e.target.value) })); setEditingVariant(null); }} className="w-full border-2 border-emerald-200 rounded-lg px-3 py-2 text-sm font-black text-slate-700 bg-white outline-none focus:border-emerald-500 appearance-none cursor-pointer pr-8">
                                                {g.variants.map((v, i) => (<option key={v.id} value={i}>{v.quantityStr} — ₹{v.price.toFixed(0)}</option>))}
                                            </select>
                                            <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none"/>
                                        </div>) : (<span className="font-bold text-slate-900 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 inline-block">{selected.quantityStr}</span>)}
                                    </td>
                                    <td className="p-4">
                                        {isEditing ? (
                                            <input type="text" value={editForm.sku} onChange={e => setEditForm({...editForm, sku: e.target.value})} className="border border-emerald-400 rounded-lg px-2 py-1 font-bold text-xs w-full outline-none"/>
                                        ) : (
                                            <span className="text-xs font-bold text-slate-700">{selected.barcode}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {isEditing ? (
                                            <input type="number" value={editForm.price} onChange={e => setEditForm({...editForm, price: e.target.value})} className="border border-emerald-400 rounded-lg px-2 py-1 font-black text-sm w-24 text-right outline-none"/>
                                        ) : (
                                            <span className="font-black text-slate-800 group-hover:text-emerald-700 text-lg">₹{selected.price.toFixed(2)}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            {isEditing ? (<>
                                                <button onClick={() => saveEdit(selected.id)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-black uppercase flex items-center gap-1 hover:bg-emerald-500"><Save size={12}/> Save</button>
                                                <button onClick={() => setEditingVariant(null)} className="px-3 py-1.5 bg-slate-200 text-slate-900 rounded-lg text-[11px] font-black uppercase hover:bg-slate-300">Cancel</button>
                                            </>) : (<>
                                                <button onClick={() => startEdit(selected)} className="p-2 bg-slate-100 hover:bg-blue-50 text-slate-800 hover:text-blue-600 rounded-lg transition" title="Edit"><Pencil size={14}/></button>
                                                <button onClick={() => handleDelete(selected)} className="p-2 bg-slate-100 hover:bg-red-50 text-slate-800 hover:text-red-600 rounded-lg transition" title="Delete"><Trash2 size={14}/></button>
                                                <button onClick={() => handleAddToPosCart(selected)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-black uppercase flex items-center gap-1 hover:bg-emerald-500"><PlusCircle size={12}/> POS</button>
                                            </>)}
                                        </div>
                                    </td>
                                </tr>);
                            })}
                        </tbody>
                    </table>)}
                </div>
            </div>

            {/* Add Product Modal */}
            {addModalOpen && (<div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                    <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-center text-white relative shrink-0">
                        <button onClick={() => setAddModalOpen(false)} className="absolute top-4 right-4 text-slate-700 hover:text-white transition"><XCircle size={22}/></button>
                        <div className="inline-flex p-3 rounded-full bg-teal-500/20 mb-3"><Package size={24} className="text-teal-400"/></div>
                        <h2 className="text-lg font-black uppercase tracking-widest text-teal-400">Add Product</h2>
                        <p className="font-bold text-sm mt-1 text-slate-900">to {selectedCategory?.name}</p>
                    </div>
                    <div className="p-6 bg-slate-50 flex-1 space-y-4 overflow-auto">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Product Name *</label>
                            <input type="text" value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} placeholder="e.g., Basmati Rice" className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                        </div>

                        {/* Single product (no variants) */}
                        {addVariants.length === 0 && (<>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Price (₹) *</label>
                                    <input type="number" value={addForm.price} onChange={e => setAddForm({...addForm, price: e.target.value})} placeholder="99" className="w-full border border-slate-300 rounded-xl p-3 text-sm font-black outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">SKU</label>
                                    <input type="text" value={addForm.sku} onChange={e => setAddForm({...addForm, sku: e.target.value})} placeholder="Optional" className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                                </div>
                            </div>
                        </>)}

                        {/* Variants Section */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-teal-600">Variants (sizes / packs)</h3>
                                <button onClick={addVariantRow} className="text-xs font-bold text-teal-600 hover:text-teal-500 flex items-center gap-1"><Plus size={14}/> Add Variant</button>
                            </div>
                            {addVariants.length === 0 ? (
                                <p className="text-xs text-slate-700 font-bold">No variants. Product will be created as single item.</p>
                            ) : (
                                <div className="space-y-2">
                                    {addVariants.map((v, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <input type="text" value={v.name} onChange={e => updateVariantRow(i, 'name', e.target.value)} placeholder="e.g., 1kg, 500g, 6 Pack" className="flex-1 border border-slate-300 rounded-lg p-2 text-xs font-bold outline-none focus:border-teal-500 bg-white"/>
                                            <input type="number" value={v.price} onChange={e => updateVariantRow(i, 'price', e.target.value)} placeholder="Price" className="w-24 border border-slate-300 rounded-lg p-2 text-xs font-bold outline-none focus:border-teal-500 bg-white"/>
                                            <input type="text" value={v.sku} onChange={e => updateVariantRow(i, 'sku', e.target.value)} placeholder="SKU" className="w-24 border border-slate-300 rounded-lg p-2 text-xs font-bold outline-none focus:border-teal-500 bg-white"/>
                                            <button onClick={() => removeVariantRow(i)} className="text-red-400 hover:text-red-600"><XCircle size={18}/></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button onClick={submitAddProduct} disabled={addLoading} className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white rounded-xl font-black uppercase tracking-widest text-sm transition shadow-lg shadow-teal-500/30 active:scale-[0.98] disabled:opacity-80 flex items-center justify-center gap-2">
                            {addLoading ? <span className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full"/> : <><PlusCircle size={16}/> Add to Vendure</>}
                        </button>
                    </div>
                </div>
            </div>)}
        </div>)}
    </div>);
}

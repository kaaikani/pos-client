"use client";
import React, { useState } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, Search, CreditCard, Banknote, User } from 'lucide-react';
// MOCK DATA
const CATEGORIES = [
    { id: 'all', name: 'All Items' },
    { id: '1', name: 'Groceries' },
    { id: '2', name: 'Beverages' },
    { id: '3', name: 'Snacks' },
    { id: '4', name: 'Personal Care' },
    { id: '5', name: 'Household' },
];
const PRODUCTS = [
    { id: 'p1', name: 'Aashirvaad Atta 5kg', price: 245.00, categoryId: '1', img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=200' },
    { id: 'p2', name: 'Fortune Sunflower Oil 1L', price: 135.00, categoryId: '1', img: 'https://images.unsplash.com/photo-1476900164809-fc1ddf8b17b2?auto=format&fit=crop&q=80&w=200' },
    { id: 'p3', name: 'Coca Cola 2L', price: 90.00, categoryId: '2', img: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=200' },
    { id: 'p4', name: 'Lays Classic Salted 50g', price: 20.00, categoryId: '3', img: 'https://images.unsplash.com/photo-1566478989037-eade3f7ceabe?auto=format&fit=crop&q=80&w=200' },
    { id: 'p5', name: 'Colgate Toothpaste 200g', price: 110.00, categoryId: '4', img: 'https://images.unsplash.com/photo-1556228578-8d89f6aca8d3?auto=format&fit=crop&q=80&w=200' },
    { id: 'p6', name: 'Surf Excel Matic 1kg', price: 215.00, categoryId: '5', img: 'https://images.unsplash.com/photo-1584820927498-cafe6c1c8f61?auto=format&fit=crop&q=80&w=200' },
    { id: 'p7', name: 'Tata Salt 1kg', price: 25.00, categoryId: '1', img: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&q=80&w=200' },
    { id: 'p8', name: 'Red Label Tea 500g', price: 280.00, categoryId: '2', img: 'https://images.unsplash.com/photo-1527004013197-933c4bb611b3?auto=format&fit=crop&q=80&w=200' },
];
export default function POSPage() {
    const [activeCategory, setActiveCategory] = useState('all');
    const [search, setSearch] = useState('');
    // CART STATE
    const [cart, setCart] = useState([]);
    // FILTERED PRODUCTS
    const displayProducts = PRODUCTS.filter(p => {
        if (activeCategory !== 'all' && p.categoryId !== activeCategory)
            return false;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase()))
            return false;
        return true;
    });
    // CART ACTIONS
    const addToCart = (product) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id
                    ? { ...item, qty: item.qty + 1, total: (item.qty + 1) * item.price }
                    : item);
            }
            return [...prev, { id: product.id, name: product.name, price: product.price, qty: 1, total: product.price }];
        });
    };
    const updateQty = (id, delta) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQty = Math.max(1, item.qty + delta);
                return { ...item, qty: newQty, total: newQty * item.price };
            }
            return item;
        }));
    };
    const removeCartItem = (id) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };
    const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);
    return (<div className="flex bg-slate-100 font-sans min-h-screen">
      
      {/* LEFT: PRODUCTS / CATEGORIES */}
      <div className="flex-1 flex flex-col max-h-screen overflow-hidden">
        
        {/* Header section */}
        <div className="bg-white px-6 py-4 shadow-sm border-b border-slate-200 z-10 shrink-0">
          <div className="flex items-center justify-between gap-4">
             <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
               <span className="text-emerald-500">#</span> Retail POS
             </h1>
             <div className="relative w-72">
               <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
               <input type="text" placeholder="Scan barcode or search name" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold shadow-inner"/>
             </div>
          </div>

          {/* Categories Horizontal Scroll */}
          <div className="flex gap-2 overflow-x-auto mt-4 pb-2 scrollbar-hide">
            {CATEGORIES.map(cat => (<button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`px-5 py-2.5 rounded-full whitespace-nowrap text-sm font-black transition-all border ${activeCategory === cat.id
                ? 'bg-slate-900 border-slate-900 text-white shadow-md transform scale-105'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'}`}>
                {cat.name}
              </button>))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4 content-start">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
             {displayProducts.map(p => (<div key={p.id} onClick={() => addToCart(p)} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl hover:border-emerald-300 transition-all cursor-pointer group flex flex-col active:scale-95 duration-200">
                  <div className="h-32 w-full bg-slate-100 relative overflow-hidden">
                     <img src={p.img} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={p.name}/>
                     <div className="absolute inset-0 bg-black/0 group-hover:bg-emerald-900/10 transition-colors"/>
                  </div>
                  <div className="p-3 flex flex-col flex-1 text-center">
                     <h3 className="text-sm font-black text-slate-800 line-clamp-2 leading-tight flex-1">{p.name}</h3>
                     <div className="mt-2 text-lg font-black text-emerald-600">₹{p.price.toFixed(2)}</div>
                  </div>
               </div>))}
          </div>
          {displayProducts.length === 0 && (<div className="text-center py-20 text-slate-400 font-bold">
              <Search size={48} className="mx-auto mb-4 opacity-50"/>
              No products found matching your search or category.
            </div>)}
        </div>
      </div>

      {/* RIGHT: CART / RETAIL SECTION */}
      <div className="w-[400px] flex-shrink-0 bg-white shadow-2xl z-20 flex flex-col border-l border-slate-200">
         {/* Cart Header */}
         <div className="px-6 py-5 bg-slate-900 text-white flex justify-between items-center shadow-md">
            <h2 className="text-xl font-black tracking-widest flex items-center gap-2"><ShoppingCart size={20}/> Current Invoice</h2>
            <button className="p-1.5 bg-white/10 hover:bg-white/20 rounded-md text-slate-300 transition"><User size={18}/></button>
         </div>

         {/* Cart Items Area */}
         <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
            {cart.length === 0 ? (<div className="flex flex-col items-center justify-center h-full text-slate-400 p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white">
                 <ShoppingCart size={48} className="mb-4 text-slate-300"/>
                 <p className="font-bold text-slate-500">Cart is empty</p>
                 <p className="text-xs mt-1">Tap products to add them to the cart.</p>
               </div>) : (<div className="space-y-3">
                  {cart.map(item => (<div key={item.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 animate-in slide-in-from-right-2">
                       <div className="flex-1">
                          <h4 className="font-bold text-slate-800 text-sm leading-tight">{item.name}</h4>
                          <div className="text-xs text-slate-500 font-bold mt-1">₹{item.price.toFixed(2)} / item</div>
                       </div>
                       
                       {/* Qty Controls */}
                       <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1 border border-slate-200">
                           <button onClick={() => updateQty(item.id, -1)} className="p-1 text-slate-500 hover:text-slate-800 hover:bg-white rounded shadow-sm"><Minus size={14}/></button>
                           <span className="w-6 text-center font-black text-sm text-slate-800">{item.qty}</span>
                           <button onClick={() => updateQty(item.id, 1)} className="p-1 text-slate-500 hover:text-slate-800 hover:bg-white rounded shadow-sm"><Plus size={14}/></button>
                       </div>

                       <div className="text-right ml-2 min-w-[70px]">
                          <div className="font-black text-slate-800 text-sm">₹{item.total.toFixed(2)}</div>
                       </div>

                       <button onClick={() => removeCartItem(item.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition ml-1"><Trash2 size={16}/></button>
                    </div>))}
               </div>)}
         </div>

         {/* Cart Footer / Checkout */}
         <div className="px-6 py-5 bg-white border-t border-slate-200 shadow-[0_-5px_15px_-10px_rgba(0,0,0,0.1)] shrink-0">
            <div className="flex justify-between items-center mb-1 text-sm font-bold text-slate-500">
               <span>Subtotal ({cart.reduce((a, b) => a + b.qty, 0)} items)</span>
               <span>₹{cartTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center mb-4 text-sm font-bold text-emerald-600">
               <span>GST (Total inclusive)</span>
               <span>₹0.00</span>
            </div>
            
            <div className="flex justify-between items-center mb-6 py-3 border-t-2 border-slate-100">
               <span className="text-xl font-bold text-slate-500">Total</span>
               <span className="text-3xl font-black text-slate-900 tracking-tight">₹{cartTotal.toFixed(2)}</span>
            </div>

            {/* Payment Actions */}
            <div className="grid grid-cols-2 gap-3 mb-3">
               <button className="py-3 bg-emerald-50 text-emerald-700 font-black rounded-xl border border-emerald-200 hover:bg-emerald-100 transition flex items-center justify-center gap-2">
                 <Banknote size={18}/> Cash
               </button>
               <button className="py-3 bg-blue-50 text-blue-700 font-black rounded-xl border border-blue-200 hover:bg-blue-100 transition flex items-center justify-center gap-2">
                 <CreditCard size={18}/> UPI / Card
               </button>
            </div>
            <button disabled={cart.length === 0} className="w-full py-4 bg-slate-900 hover:bg-emerald-600 text-white font-black rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
               Checkout Order
            </button>
         </div>
      </div>
    </div>);
}

import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend 
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Plus, Minus, BarChart3, List, Activity, AlertCircle, Settings, Trash2, Edit3, X, Check, Package, Hash } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function App() {
  const [products, setProducts] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [overallCounts, setOverallCounts] = useState<Record<string, number>>({});
  const [featuredCounts, setFeaturedCounts] = useState<Record<string, number>>({});
  const [keywordCounts, setKeywordCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showManager, setShowManager] = useState(false);
  const [managerTab, setManagerTab] = useState<'products' | 'keywords'>('products');
  const [newItemName, setNewItemName] = useState('');
  const [editingItem, setEditingItem] = useState<{old: string, new: string} | null>(null);

  useEffect(() => {
    fetchInitialData();
    
    const subscription = supabase
      .channel('public:all_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_stats' }, () => fetchCounts(products, keywords))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_list' }, () => fetchInitialData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'keyword_list' }, () => fetchInitialData())
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [products, keywords]); // 修复：使用完整的数组作为依赖项，确保重命名时也能触发更新

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [pRes, kRes] = await Promise.all([
        supabase.from('product_list').select('name').order('name'),
        supabase.from('keyword_list').select('name').order('name')
      ]);

      if (pRes.error) throw pRes.error;
      if (kRes.error) throw kRes.error;

      const productNames = pRes.data?.map(p => p.name) || [];
      const keywordNames = kRes.data?.map(k => k.name) || [];
      
      setProducts(productNames);
      setKeywords(keywordNames);
      setError(null);
      await fetchCounts(productNames, keywordNames);
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(`数据同步失败: ${err.message}。请确保已经在 Supabase SQL Editor 中运行了建表脚本。`);
    } finally {
      setLoading(false);
    }
  };

  const fetchCounts = async (currentProducts: string[], currentKeywords: string[]) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('product_stats')
        .select('product_name, count');

      if (fetchError) throw fetchError;

      const newOverall: Record<string, number> = {};
      const newFeatured: Record<string, number> = {};
      const newKeywords: Record<string, number> = {};
      
      currentProducts.forEach(p => {
        newOverall[p] = 0;
        newFeatured[p] = 0;
      });
      currentKeywords.forEach(k => {
        newKeywords[k] = 0;
      });

      data?.forEach((row: any) => {
        if (row.product_name.startsWith('overall:')) {
          const name = row.product_name.replace('overall:', '');
          if (currentProducts.includes(name)) newOverall[name] = row.count;
        } else if (row.product_name.startsWith('featured:')) {
          const name = row.product_name.replace('featured:', '');
          if (currentProducts.includes(name)) newFeatured[name] = row.count;
        } else if (row.product_name.startsWith('keyword:')) {
          const name = row.product_name.replace('keyword:', '');
          if (currentKeywords.includes(name)) newKeywords[name] = row.count;
        }
      });
      setOverallCounts(newOverall);
      setFeaturedCounts(newFeatured);
      setKeywordCounts(newKeywords);
    } catch (err: any) {
      console.error('Error fetching counts:', err);
    }
  };

  const updateCount = async (name: string, delta: number, type: 'overall' | 'featured' | 'keyword') => {
    const currentCounts = type === 'overall' ? overallCounts : type === 'featured' ? featuredCounts : keywordCounts;
    const setter = type === 'overall' ? setOverallCounts : type === 'featured' ? setFeaturedCounts : setKeywordCounts;
    const dbKey = `${type}:${name}`;
    const newCount = Math.max(0, (currentCounts[name] || 0) + delta);
    
    setter(prev => ({ ...prev, [name]: newCount }));

    try {
      const { error: upsertError } = await supabase
        .from('product_stats')
        .upsert({ product_name: dbKey, count: newCount }, { onConflict: 'product_name' });
      if (upsertError) throw upsertError;
    } catch (err: any) {
      setter(prev => ({ ...prev, [name]: Math.max(0, newCount - delta) }));
      alert('更新失败: ' + err.message);
    }
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    const table = managerTab === 'products' ? 'product_list' : 'keyword_list';
    try {
      const { error: addError } = await supabase.from(table).insert({ name: newItemName.trim() });
      if (addError) throw addError;
      setNewItemName('');
      fetchInitialData();
    } catch (err: any) {
      alert('添加失败: ' + err.message);
    }
  };

  const handleDeleteItem = async (name: string) => {
    if (!confirm(`确定要删除吗？相关的统计数据也将不再显示。`)) return;
    const table = managerTab === 'products' ? 'product_list' : 'keyword_list';
    try {
      const { error: delError } = await supabase.from(table).delete().eq('name', name);
      if (delError) throw delError;
      fetchInitialData();
    } catch (err: any) {
      alert('删除失败: ' + err.message);
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItem || !editingItem.new.trim() || editingItem.old === editingItem.new) {
      setEditingItem(null);
      return;
    }
    const table = managerTab === 'products' ? 'product_list' : 'keyword_list';
    try {
      const { error: upError } = await supabase
        .from(table)
        .update({ name: editingItem.new.trim() })
        .eq('name', editingItem.old);
      if (upError) throw upError;
      setEditingItem(null);
      fetchInitialData();
    } catch (err: any) {
      alert('更新失败: ' + err.message);
    }
  };

  const renderSection = (title: string, dataNames: string[], counts: Record<string, number>, type: 'overall' | 'featured' | 'keyword') => {
    const chartData = {
      labels: dataNames,
      datasets: [
        {
          label: '点击/使用次数',
          data: dataNames.map(n => counts[n] || 0),
          backgroundColor: type === 'overall' ? 'rgba(59, 130, 246, 0.6)' : type === 'featured' ? 'rgba(16, 185, 129, 0.6)' : 'rgba(245, 158, 11, 0.6)',
          borderRadius: 6,
        },
      ],
    };

    return (
      <section className="mb-24 animate-in fade-in duration-700">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-black text-slate-800 flex items-center gap-4">
            <div className={`w-3 h-10 rounded-full ${type === 'overall' ? 'bg-blue-600' : type === 'featured' ? 'bg-green-500' : 'bg-amber-500'} shadow-lg`}></div>
            {title}
          </h2>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-1 bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 flex flex-col overflow-hidden">
            <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {type === 'keyword' ? <Hash className="w-5 h-5 text-amber-500" /> : <List className="w-5 h-5 text-blue-500" />}
                <h3 className="text-xl font-black text-slate-700">{type === 'keyword' ? '词库清单' : '产品清单'}</h3>
              </div>
              <span className="px-3 py-1 bg-white text-slate-400 text-xs font-black rounded-full border border-slate-100">{dataNames.length} 项</span>
            </div>
            <div className="overflow-y-auto max-h-[500px] p-6 space-y-4">
              {dataNames.map((name) => (
                <div key={name} className="group flex items-center justify-between p-5 rounded-3xl bg-white border border-slate-100 hover:border-blue-200 hover:shadow-xl transition-all duration-300">
                  <div className="flex flex-col">
                    <span className="text-md font-black text-slate-800 tracking-tight">{name}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${type === 'overall' ? 'bg-blue-400' : type === 'featured' ? 'bg-green-400' : 'bg-amber-400'}`}></div>
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{(counts[name] || 0)} 次统计</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => updateCount(name, -1, type)} disabled={(counts[name] || 0) <= 0} className="p-2.5 bg-slate-50 text-slate-300 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all disabled:opacity-20">
                      <Minus className="w-4 h-4" />
                    </button>
                    <button onClick={() => updateCount(name, 1, type)} className={`p-2.5 rounded-2xl transition-all ${type === 'overall' ? 'bg-blue-50 text-blue-600 hover:bg-blue-600' : type === 'featured' ? 'bg-green-50 text-green-600 hover:bg-green-600' : 'bg-amber-50 text-amber-600 hover:bg-amber-600'} hover:text-white`}>
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100">
            <div className="flex items-center gap-2 mb-10">
              <BarChart3 className="w-6 h-6 text-slate-300" />
              <h3 className="text-xl font-black text-slate-700 tracking-tight">趋势可视化分析</h3>
            </div>
            <div className="h-[450px]">
              {loading ? (
                <div className="h-full flex items-center justify-center text-slate-300 font-black animate-pulse uppercase tracking-[0.2em]">Syncing Data...</div>
              ) : (
                <Bar 
                  data={chartData} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: '#0f172a',
                        padding: 16,
                        cornerRadius: 16,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13, weight: 'normal' }
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { color: '#94a3b8', font: { weight: 'bold' } }
                      },
                      x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { size: 10, weight: 'bold' } }
                      }
                    }
                  }} 
                />
              )}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const totalClicks = Object.values(overallCounts).reduce((a, b) => a + b, 0) + 
                     Object.values(featuredCounts).reduce((a, b) => a + b, 0) +
                     Object.values(keywordCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 md:p-16 text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-24 flex flex-col lg:flex-row lg:items-center justify-between gap-12">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-white shadow-sm border border-slate-100 text-blue-600 rounded-full text-xs font-black uppercase tracking-[0.2em]">
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></div>
              GEO Insights Engine 2026
            </div>
            <h1 className="text-6xl font-black text-slate-900 tracking-tighter leading-none">整体文章提到产品布局</h1>
            <p className="text-slate-400 font-bold text-xl tracking-tight max-w-2xl">基于实时数据驱动的 GEO 推文优化策略看板，助力公司产品精准触达生成式引擎搜索。</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-6">
            <div className="bg-white p-8 rounded-[3rem] shadow-2xl shadow-blue-100/40 border border-blue-50 flex items-center gap-8 pr-12 group hover:scale-105 transition-all duration-500">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[1.5rem] flex items-center justify-center shadow-2xl shadow-blue-200 group-hover:rotate-6 transition-transform">
                <Package className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-black uppercase tracking-[0.2em] mb-1">全维度统计总量</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black text-slate-900 tabular-nums tracking-tighter">{totalClicks}</span>
                  <span className="text-blue-500 font-black text-sm uppercase tracking-widest">Analytics</span>
                </div>
              </div>
            </div>
            <button onClick={() => setShowManager(!showManager)} className={`p-6 rounded-[2rem] transition-all shadow-2xl hover:scale-110 active:scale-90 ${showManager ? 'bg-blue-600 text-white shadow-blue-200' : 'bg-white text-slate-300 hover:text-blue-600 border border-slate-100 shadow-slate-100'}`}>
              <Settings className={`w-8 h-8 ${showManager ? 'animate-spin-slow' : ''}`} />
            </button>
          </div>
        </header>

        {showManager && (
          <section className="mb-24 bg-white p-12 rounded-[4rem] shadow-2xl shadow-slate-200/50 border border-blue-50 animate-in zoom-in-95 duration-500 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full -translate-y-1/2 translate-x-1/2 opacity-50 blur-3xl"></div>
            
            <div className="flex items-center justify-between mb-12 relative z-10">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-900 rounded-2xl text-white">
                  <Settings className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight">维度资源管理器</h2>
                  <p className="text-slate-400 font-bold mt-1">管理产品列表与 GEO 优化关键词库</p>
                </div>
              </div>
              <button onClick={() => setShowManager(false)} className="p-3 hover:bg-slate-50 rounded-full text-slate-300 transition-colors">
                <X className="w-8 h-8" />
              </button>
            </div>

            <div className="flex gap-4 mb-10 p-1.5 bg-slate-50 rounded-3xl w-fit relative z-10">
              <button onClick={() => setManagerTab('products')} className={`px-8 py-3 rounded-2xl font-black transition-all ${managerTab === 'products' ? 'bg-white text-blue-600 shadow-xl shadow-blue-100' : 'text-slate-400 hover:text-slate-600'}`}>产品管理</button>
              <button onClick={() => setManagerTab('keywords')} className={`px-8 py-3 rounded-2xl font-black transition-all ${managerTab === 'keywords' ? 'bg-white text-amber-600 shadow-xl shadow-amber-100' : 'text-slate-400 hover:text-slate-600'}`}>关键词管理</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 relative z-10">
              <div className="space-y-8">
                <div className="space-y-4">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                    {managerTab === 'products' ? <Package className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
                    快速新增{managerTab === 'products' ? '产品' : '关键词'}
                  </label>
                  <div className="flex gap-4">
                    <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder={`输入${managerTab === 'products' ? '产品名称' : 'GEO 关键词'}...`} className="flex-1 bg-slate-50 border-2 border-transparent rounded-[1.5rem] px-8 py-5 text-slate-800 font-black placeholder:text-slate-300 focus:bg-white focus:border-blue-500 transition-all outline-none" />
                    <button onClick={handleAddItem} className={`px-10 rounded-[1.5rem] font-black text-white transition-all shadow-xl active:scale-95 flex items-center gap-2 ${managerTab === 'products' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-100'}`}>
                      <Plus className="w-6 h-6" /> 添加
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <label className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                  <List className="w-4 h-4" /> 现有库统计 ({managerTab === 'products' ? products.length : keywords.length} 项)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                  {(managerTab === 'products' ? products : keywords).map(item => (
                    <div key={item} className="flex items-center justify-between p-5 bg-slate-50 rounded-[1.5rem] group border-2 border-transparent hover:border-white hover:bg-white hover:shadow-2xl hover:shadow-slate-200 transition-all duration-300">
                      {editingItem?.old === item ? (
                        <input autoFocus className="bg-slate-100 border-none rounded-xl px-4 py-2 text-sm font-black w-full mr-4 outline-none focus:ring-2 focus:ring-blue-500" value={editingItem.new} onChange={(e) => setEditingItem({...editingItem, new: e.target.value})} onBlur={handleUpdateItem} onKeyDown={(e) => e.key === 'Enter' && handleUpdateItem()} />
                      ) : (
                        <span className="text-md font-black text-slate-600 truncate">{item}</span>
                      )}
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => setEditingItem({old: item, new: item})} className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteItem(item)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="mb-16 p-8 bg-red-50 border-2 border-red-100 rounded-[3rem] flex items-center gap-6 text-red-600 shadow-2xl shadow-red-100/50 animate-bounce">
            <div className="p-4 bg-white rounded-2xl shadow-xl"><AlertCircle className="w-8 h-8" /></div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest mb-1">System Warning</p>
              <p className="text-xl font-black">{error}</p>
            </div>
          </div>
        )}

        <div className="space-y-32">
          {renderSection("整体文章提到产品布局", products, overallCounts, "overall")}
          {renderSection("主推产品文章布局", products, featuredCounts, "featured")}
          {renderSection("GEO 优化关键词云", keywords, keywordCounts, "keyword")}
        </div>
        
        <footer className="mt-48 pb-16 text-center space-y-4">
          <div className="h-px bg-slate-200 w-32 mx-auto"></div>
          <p className="text-slate-300 text-xs font-black uppercase tracking-[0.5em]">
            GEO Product Layout Analytics • Global Strategy • 2026 Live
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;

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
import { Plus, Minus, BarChart3, List, Activity, AlertCircle, Sparkles, Loader2, Settings, Trash2, Edit3, X, Check, Package, Save } from 'lucide-react';
import { analyzeProductLayout } from './aiClient';

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
  const [overallCounts, setOverallCounts] = useState<Record<string, number>>({});
  const [featuredCounts, setFeaturedCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [editingProduct, setEditingProduct] = useState<{old: string, new: string} | null>(null);

  useEffect(() => {
    fetchInitialData();
    
    const subscription = supabase
      .channel('public:all_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_stats' }, () => fetchCounts(products))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_list' }, () => fetchInitialData())
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [products.length]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const { data: productData, error: pError } = await supabase
        .from('product_list')
        .select('name')
        .order('name');

      if (pError) throw pError;

      const productNames = productData.map(p => p.name);
      setProducts(productNames);
      await fetchCounts(productNames);
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError('无法获取产品列表，请确保已创建 product_list 表');
    } finally {
      setLoading(false);
    }
  };

  const fetchCounts = async (currentProducts: string[]) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('product_stats')
        .select('product_name, count');

      if (fetchError) throw fetchError;

      const newOverall: Record<string, number> = {};
      const newFeatured: Record<string, number> = {};
      currentProducts.forEach(p => {
        newOverall[p] = 0;
        newFeatured[p] = 0;
      });

      data?.forEach((row: any) => {
        if (row.product_name.startsWith('overall:')) {
          const name = row.product_name.replace('overall:', '');
          if (currentProducts.includes(name)) newOverall[name] = row.count;
        } else if (row.product_name.startsWith('featured:')) {
          const name = row.product_name.replace('featured:', '');
          if (currentProducts.includes(name)) newFeatured[name] = row.count;
        }
      });
      setOverallCounts(newOverall);
      setFeaturedCounts(newFeatured);
    } catch (err: any) {
      console.error('Error fetching counts:', err);
    }
  };

  const updateCount = async (productName: string, delta: number, layoutType: 'overall' | 'featured') => {
    const currentCounts = layoutType === 'overall' ? overallCounts : featuredCounts;
    const setter = layoutType === 'overall' ? setOverallCounts : setFeaturedCounts;
    const dbKey = `${layoutType}:${productName}`;
    const newCount = Math.max(0, (currentCounts[productName] || 0) + delta);
    
    setter(prev => ({ ...prev, [productName]: newCount }));

    try {
      const { error: upsertError } = await supabase
        .from('product_stats')
        .upsert({ product_name: dbKey, count: newCount }, { onConflict: 'product_name' });
      if (upsertError) throw upsertError;
    } catch (err: any) {
      setter(prev => ({ ...prev, [productName]: Math.max(0, newCount - delta) }));
      alert('更新失败: ' + err.message);
    }
  };

  const handleAddProduct = async () => {
    if (!newProductName.trim()) return;
    try {
      const { error: addError } = await supabase.from('product_list').insert({ name: newProductName.trim() });
      if (addError) throw addError;
      setNewProductName('');
      fetchInitialData();
    } catch (err: any) {
      alert('添加失败: ' + err.message);
    }
  };

  const handleDeleteProduct = async (name: string) => {
    if (!confirm(`确定要删除产品 "${name}" 吗？相关的统计数据也将不再显示。`)) return;
    try {
      const { error: delError } = await supabase.from('product_list').delete().eq('name', name);
      if (delError) throw delError;
      fetchInitialData();
    } catch (err: any) {
      alert('删除失败: ' + err.message);
    }
  };

  const handleUpdateProduct = async () => {
    if (!editingProduct || !editingProduct.new.trim() || editingProduct.old === editingProduct.new) {
      setEditingProduct(null);
      return;
    }
    try {
      const { error: upError } = await supabase
        .from('product_list')
        .update({ name: editingProduct.new.trim() })
        .eq('name', editingProduct.old);
      if (upError) throw upError;
      
      // 同时更新统计表中的 key (可选，这里简单处理)
      setEditingProduct(null);
      fetchInitialData();
    } catch (err: any) {
      alert('更新失败: ' + err.message);
    }
  };

  const handleAiAnalyze = async () => {
    setAnalyzing(true);
    setAiAnalysis(null);
    try {
      const result = await analyzeProductLayout(overallCounts, featuredCounts);
      setAiAnalysis(result);
    } catch (err: any) {
      alert('AI 分析失败: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const renderSection = (title: string, counts: Record<string, number>, layoutType: 'overall' | 'featured') => {
    const chartData = {
      labels: products,
      datasets: [
        {
          label: '点击次数',
          data: products.map(p => counts[p] || 0),
          backgroundColor: layoutType === 'overall' ? 'rgba(59, 130, 246, 0.6)' : 'rgba(16, 185, 129, 0.6)',
          borderRadius: 6,
        },
      ],
    };

    return (
      <section className="mb-16 animate-in fade-in duration-700">
        <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3">
          <div className={`w-2 h-8 rounded-full ${layoutType === 'overall' ? 'bg-blue-500' : 'bg-green-500 shadow-lg shadow-green-200'}`}></div>
          {title}
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex items-center gap-2">
              <List className="w-5 h-5 text-slate-400" />
              <h3 className="text-lg font-bold text-slate-700">实时清单</h3>
            </div>
            <div className="overflow-y-auto max-h-[500px] p-4 space-y-3">
              {products.map((product) => (
                <div key={product} className="group flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-700">{product}</span>
                    <span className="text-xs font-bold text-blue-500 mt-0.5 tracking-wider">{counts[product] || 0} CLICKS</span>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => updateCount(product, -1, layoutType)} disabled={(counts[product] || 0) <= 0} className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-30">
                      <Minus className="w-4 h-4" />
                    </button>
                    <button onClick={() => updateCount(product, 1, layoutType)} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100">
            <div className="flex items-center gap-2 mb-8">
              <BarChart3 className="w-5 h-5 text-slate-400" />
              <h3 className="text-lg font-bold text-slate-700">数据可视化</h3>
            </div>
            <div className="h-[400px]">
              {loading ? <div className="h-full flex items-center justify-center text-slate-400">同步云端数据...</div> : <Bar data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', padding: 12, cornerRadius: 12 } }, scales: { y: { beginAtZero: true, grid: { color: '#f8fafc' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } } } }} />}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const totalClicks = Object.values(overallCounts).reduce((a, b) => a + b, 0) + Object.values(featuredCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-[#fcfdfe] p-4 md:p-12 text-slate-900 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-16 flex flex-col lg:row md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-black uppercase tracking-widest mb-2">
              <Activity className="w-3 h-3" /> Dashboard Live
            </div>
            <h1 className="text-5xl font-black text-slate-900 tracking-tighter">整体文章提到产品布局</h1>
            <p className="text-slate-400 font-medium text-lg">基于实时点击数据的 GEO 推文优化策略看板</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="bg-white p-6 rounded-[2rem] shadow-2xl shadow-blue-100/50 border border-blue-50 flex items-center gap-6 pr-10">
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 rotate-3">
                <Package className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-1">全站总点击量</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-slate-900">{totalClicks}</span>
                  <span className="text-blue-500 font-bold text-sm">Hits</span>
                </div>
              </div>
            </div>
            <button onClick={() => setShowManager(!showManager)} className={`p-4 rounded-2xl transition-all shadow-lg ${showManager ? 'bg-blue-600 text-white shadow-blue-200' : 'bg-white text-slate-400 hover:text-blue-600 border border-slate-100 shadow-slate-100'}`}>
              <Settings className={`w-6 h-6 ${showManager ? 'animate-spin-slow' : ''}`} />
            </button>
          </div>
        </header>

        {showManager && (
          <section className="mb-16 bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200/40 border border-blue-50 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-2xl font-black text-slate-800">产品迭代管理</h2>
                <p className="text-slate-400 text-sm mt-1">新增、修改或删除仪表盘中的产品项</p>
              </div>
              <button onClick={() => setShowManager(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-300 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <label className="block text-sm font-black text-slate-400 uppercase tracking-widest">快速新增产品</label>
                <div className="flex gap-3">
                  <input type="text" value={newProductName} onChange={(e) => setNewProductName(e.target.value)} placeholder="输入产品名称..." className="flex-1 bg-slate-50 border-none rounded-2xl px-6 py-4 text-slate-700 font-bold focus:ring-2 focus:ring-blue-500 transition-all" />
                  <button onClick={handleAddProduct} className="bg-blue-600 text-white px-8 rounded-2xl font-black hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2">
                    <Plus className="w-5 h-5" /> 添加
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <label className="block text-sm font-black text-slate-400 uppercase tracking-widest">现有产品清单 ({products.length})</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {products.map(p => (
                    <div key={p} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl group border border-transparent hover:border-blue-100 transition-all">
                      {editingProduct?.old === p ? (
                        <input autoFocus className="bg-white border-none rounded-lg px-2 py-1 text-sm font-bold w-full mr-2" value={editingProduct.new} onChange={(e) => setEditingProduct({...editingProduct, new: e.target.value})} onBlur={handleUpdateProduct} onKeyDown={(e) => e.key === 'Enter' && handleUpdateProduct()} />
                      ) : (
                        <span className="text-sm font-bold text-slate-600 truncate">{p}</span>
                      )}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingProduct({old: p, new: p})} className="p-2 text-slate-400 hover:text-blue-500 transition-colors"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteProduct(p)} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="mb-12 p-6 bg-red-50 border border-red-100 rounded-[2rem] flex items-center gap-4 text-red-600 shadow-lg shadow-red-100/50 animate-bounce">
            <div className="p-2 bg-white rounded-xl shadow-sm"><AlertCircle className="w-6 h-6" /></div>
            <p className="font-bold">{error}</p>
          </div>
        )}

        {renderSection("整体文章提到产品布局", overallCounts, "overall")}
        <div className="flex items-center gap-4 mb-16 opacity-30">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
          <Activity className="w-4 h-4 text-slate-300" />
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
        </div>
        {renderSection("主推产品文章布局", featuredCounts, "featured")}

        <section className="mt-24 bg-slate-900 rounded-[3rem] p-12 text-white relative overflow-hidden shadow-2xl shadow-blue-900/20">
          <div className="absolute top-0 right-0 p-12 opacity-10 scale-150 rotate-12">
            <Sparkles className="w-64 h-64 text-blue-400" />
          </div>
          
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 mb-12">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-500/40">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <div>
                  <h2 className="text-4xl font-black tracking-tight">AI Agent 智能诊断</h2>
                  <p className="text-blue-300/60 font-medium mt-1">基于当前实时数据生成 GEO 布局建议</p>
                </div>
              </div>
              <button onClick={handleAiAnalyze} disabled={analyzing} className="group relative px-10 py-5 bg-white text-slate-900 font-black rounded-[2rem] hover:scale-105 transition-all shadow-2xl disabled:opacity-50 active:scale-95 overflow-hidden">
                <span className="relative z-10 flex items-center gap-3 text-lg">
                  {analyzing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6 text-blue-600" />}
                  {analyzing ? 'AGENT IS THINKING...' : 'START DIAGNOSIS'}
                </span>
                <div className="absolute inset-0 bg-blue-50 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
              </button>
            </div>

            {aiAnalysis ? (
              <div className="bg-white/5 backdrop-blur-xl p-10 rounded-[2.5rem] border border-white/10 animate-in fade-in zoom-in-95 duration-500">
                <div className="whitespace-pre-wrap text-blue-50/90 leading-relaxed font-medium text-lg">
                  {aiAnalysis}
                </div>
              </div>
            ) : (
              <div className="text-center py-24 bg-white/5 rounded-[2.5rem] border border-white/5 border-dashed">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Activity className="w-10 h-10 text-white/20" />
                </div>
                <p className="text-white/30 font-black uppercase tracking-[0.3em]">Ready to analyze your strategy</p>
              </div>
            )}
          </div>
        </section>
        
        <footer className="mt-24 pb-12 text-center text-slate-300 text-sm font-bold uppercase tracking-widest">
          GEO Product Layout Analytics • 2026 Live
        </footer>
      </div>
    </div>
  );
}

export default App;

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
import { Plus, Minus, BarChart3, List, Activity, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import { analyzeProductLayout } from './aiClient';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const PRODUCT_NAMES = [
  "SCOUT MINI", "SCOUT 2.0", "TRACER 2.0", "BUNKER MINI 2.0", 
  "BUNKER PRO 2.0", "RANGER MINI 3.0", "RANGER AIR/DELTA", "UMR", 
  "HUNTER 2.0", "HUNTER SE", "Pika", "PiPER", "NERO", "LiMO", 
  "T-REX", "COBOT"
];

function App() {
  const [overallCounts, setOverallCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    PRODUCT_NAMES.forEach(p => initial[p] = 0);
    return initial;
  });
  const [featuredCounts, setFeaturedCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    PRODUCT_NAMES.forEach(p => initial[p] = 0);
    return initial;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleAiAnalyze = async () => {
    setAnalyzing(true);
    setAiAnalysis(null);
    try {
      const result = await analyzeProductLayout(overallCounts, featuredCounts);
      setAiAnalysis(result);
    } catch (err: any) {
      alert('AI 分析失败: ' + (err.message || '请检查 API Key 或网络'));
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    fetchCounts();
    
    // 订阅实时更新
    const subscription = supabase
      .channel('public:product_stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_stats' }, () => {
        fetchCounts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const fetchCounts = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('product_stats')
        .select('product_name, count');

      if (fetchError) throw fetchError;

      if (data) {
        const newOverall: Record<string, number> = {};
        const newFeatured: Record<string, number> = {};
        PRODUCT_NAMES.forEach(p => {
          newOverall[p] = 0;
          newFeatured[p] = 0;
        });

        data.forEach((row: any) => {
          if (row.product_name.startsWith('overall:')) {
            newOverall[row.product_name.replace('overall:', '')] = row.count;
          } else if (row.product_name.startsWith('featured:')) {
            newFeatured[row.product_name.replace('featured:', '')] = row.count;
          }
        });
        setOverallCounts(newOverall);
        setFeaturedCounts(newFeatured);
        setError(null);
      }
    } catch (err: any) {
      console.error('Error fetching from Supabase:', err);
      setError(err.message || '无法连接到数据库，请检查网络或表结构');
    } finally {
      setLoading(false);
    }
  };

  const updateCount = async (productName: string, delta: number, layoutType: 'overall' | 'featured') => {
    const currentCounts = layoutType === 'overall' ? overallCounts : featuredCounts;
    const setter = layoutType === 'overall' ? setOverallCounts : setFeaturedCounts;
    const dbKey = `${layoutType}:${productName}`;
    
    const newCount = Math.max(0, (currentCounts[productName] || 0) + delta);
    
    // 乐观更新 UI
    setter(prev => ({ ...prev, [productName]: newCount }));

    try {
      const { error: upsertError } = await supabase
        .from('product_stats')
        .upsert({ product_name: dbKey, count: newCount }, { onConflict: 'product_name' });

      if (upsertError) throw upsertError;
    } catch (err: any) {
      console.error('Error updating count:', err);
      setter(prev => ({ ...prev, [productName]: Math.max(0, newCount - delta) }));
      alert('更新失败: ' + (err.message || '请确保数据库中已创建 product_stats 表'));
    }
  };

  const renderSection = (title: string, counts: Record<string, number>, layoutType: 'overall' | 'featured') => {
    const chartData = {
      labels: PRODUCT_NAMES,
      datasets: [
        {
          label: '点击次数',
          data: PRODUCT_NAMES.map(p => counts[p] || 0),
          backgroundColor: layoutType === 'overall' ? 'rgba(59, 130, 246, 0.6)' : 'rgba(16, 185, 129, 0.6)',
          borderRadius: 6,
        },
      ],
    };

    return (
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <div className={`w-2 h-8 rounded-full ${layoutType === 'overall' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
          {title}
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 产品列表 */}
          <div className="lg:col-span-1 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center gap-2">
              <List className="w-5 h-5 text-slate-400" />
              <h3 className="text-lg font-semibold text-slate-800">产品列表</h3>
            </div>
            <div className="overflow-y-auto max-h-[500px] p-4 space-y-2">
              {PRODUCT_NAMES.map((product) => (
                <div 
                  key={product}
                  className="group flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-700">{product}</span>
                    <span className="text-xs font-medium text-blue-600">{counts[product] || 0} 次统计</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateCount(product, -1, layoutType)}
                      disabled={(counts[product] || 0) <= 0}
                      className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-white hover:bg-red-500 hover:border-red-500 transition-all shadow-sm active:scale-95 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-400 disabled:hover:border-slate-200"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => updateCount(product, 1, layoutType)}
                      className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-white hover:bg-blue-600 hover:border-blue-600 transition-all shadow-sm active:scale-95"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 可视化图表 */}
          <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-8">
              <BarChart3 className="w-5 h-5 text-slate-400" />
              <h3 className="text-lg font-semibold text-slate-800">数据分布趋势</h3>
            </div>
            <div className="h-[400px]">
              {loading ? (
                <div className="h-full flex items-center justify-center text-slate-400">加载中...</div>
              ) : (
                <Bar 
                  data={chartData} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: '#1e293b',
                        padding: 12,
                        cornerRadius: 8,
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { color: '#64748b' }
                      },
                      x: {
                        grid: { display: false },
                        ticks: { color: '#64748b', font: { size: 10 } }
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
                     Object.values(featuredCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">产品布局统计看板</h1>
            <p className="text-slate-500 mt-2 flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
              云端实时同步系统
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-white px-8 py-4 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-2xl">
                <Activity className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">全站总统计</p>
                <p className="text-2xl font-black text-slate-900">{totalClicks}</p>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">提示: {error}</p>
          </div>
        )}

        {renderSection("整体文章提到产品布局", overallCounts, "overall")}
        <div className="h-px bg-slate-200 mb-16"></div>
        {renderSection("主推产品文章布局", featuredCounts, "featured")}

        {/* AI Agent 分析模块 */}
        <section className="mt-12 bg-white rounded-3xl p-8 border border-blue-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Sparkles className="w-32 h-32 text-blue-600" />
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-600 rounded-2xl shadow-xl shadow-blue-200">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight">AI Agent 智能诊断</h2>
                  <p className="text-sm text-slate-500 font-medium">基于当前 GEO 数据进行深度布局分析</p>
                </div>
              </div>
              <button
                onClick={handleAiAnalyze}
                disabled={analyzing}
                className="flex items-center gap-2 px-8 py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-blue-600 transition-all shadow-xl active:scale-95 disabled:opacity-50"
              >
                {analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {analyzing ? '思考中...' : '开始 AI 诊断'}
              </button>
            </div>

            {aiAnalysis ? (
              <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 animate-in fade-in slide-in-from-bottom-4">
                <div className="whitespace-pre-wrap text-slate-700 leading-relaxed font-medium">
                  {aiAnalysis}
                </div>
              </div>
            ) : (
              <div className="text-center py-16 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/30">
                <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Activity className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-slate-400 font-bold">准备就绪，点击上方按钮开启数据洞察</p>
                <p className="text-slate-300 text-sm mt-1 uppercase tracking-widest font-bold">Ready to analyze</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;

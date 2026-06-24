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
import { Plus, BarChart3, List, Activity, AlertCircle } from 'lucide-react';

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
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    PRODUCT_NAMES.forEach(p => initial[p] = 0);
    return initial;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const newCounts: Record<string, number> = {};
        PRODUCT_NAMES.forEach(p => newCounts[p] = 0);
        data.forEach((row: any) => {
          newCounts[row.product_name] = row.count;
        });
        setCounts(newCounts);
        setError(null);
      }
    } catch (err: any) {
      console.error('Error fetching from Supabase:', err);
      setError(err.message || '无法连接到数据库，请检查网络或表结构');
    } finally {
      setLoading(false);
    }
  };

  const handleIncrement = async (productName: string) => {
    const newCount = (counts[productName] || 0) + 1;
    
    // 乐观更新 UI
    setCounts(prev => ({ ...prev, [productName]: newCount }));

    try {
      const { error: upsertError } = await supabase
        .from('product_stats')
        .upsert({ product_name: productName, count: newCount }, { onConflict: 'product_name' });

      if (upsertError) throw upsertError;
    } catch (err: any) {
      console.error('Error updating count:', err);
      // 如果失败，回滚本地状态
      setCounts(prev => ({ ...prev, [productName]: newCount - 1 }));
      alert('更新失败: ' + (err.message || '请确保数据库中已创建 product_stats 表'));
    }
  };

  const chartData = {
    labels: PRODUCT_NAMES,
    datasets: [
      {
        label: '点击次数',
        data: PRODUCT_NAMES.map(p => counts[p] || 0),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderRadius: 6,
      },
    ],
  };

  const totalClicks = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">产品可视化仪表盘</h1>
            <p className="text-slate-500 mt-1">云端实时同步统计 (Supabase 版)</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-white px-6 py-3 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Activity className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">总点击</p>
                <p className="text-xl font-bold text-slate-900">{totalClicks}</p>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">提示: {error} (请确保已在 Supabase 运行建表 SQL)</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center gap-2">
              <List className="w-5 h-5 text-slate-400" />
              <h2 className="text-lg font-semibold text-slate-800">产品列表</h2>
            </div>
            <div className="overflow-y-auto max-h-[600px] p-4 space-y-2">
              {PRODUCT_NAMES.map((product) => (
                <div 
                  key={product}
                  className="group flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-700">{product}</span>
                    <span className="text-xs font-medium text-blue-600">{counts[product] || 0} 次统计</span>
                  </div>
                  <button
                    onClick={() => handleIncrement(product)}
                    className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-white hover:bg-blue-600 hover:border-blue-600 transition-all shadow-sm active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 mb-8">
                <BarChart3 className="w-5 h-5 text-slate-400" />
                <h2 className="text-lg font-semibold text-slate-800">数据分布趋势</h2>
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
        </div>
      </div>
    </div>
  );
}

export default App;

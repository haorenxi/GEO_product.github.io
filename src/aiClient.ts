export const analyzeProductLayout = async (overallData: any, featuredData: any) => {
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
  
  if (!apiKey) {
    throw new Error('未检测到 VITE_DEEPSEEK_API_KEY，请先配置环境变量');
  }

  const prompt = `
    作为一名GEO（生成式引擎优化）专家，请根据以下实时产品点击统计数据，分析公司在推文撰写和GEO搜索方面的布局情况：
    
    【整体文章布局统计】：${JSON.stringify(overallData)}
    【主推产品文章布局统计】：${JSON.stringify(featuredData)}
    
    请按以下结构输出专业分析（Markdown格式）：
    ### 1. 核心洞察 (Insights)
    分析哪些产品在两种布局下表现差异最大，哪些产品是当前的流量支柱。
    
    ### 2. GEO 推文撰写建议
    针对主推产品与实际点击的偏差，建议后续在推文中如何调整关键词权重、文案描述和发布频率。
    
    ### 3. 策略调整方向
    给出具体的、可操作的3条改进策略。
    
    请用专业、简洁的中文回答。
  `;

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个精通GEO（生成式引擎优化）和产品营销的数据分析师。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'API 请求失败');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (err: any) {
    console.error('DeepSeek API Error:', err);
    throw err;
  }
};

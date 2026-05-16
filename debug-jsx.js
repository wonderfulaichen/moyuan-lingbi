
const fs = require('fs');

function debugJSX(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  const stack = [];
  
  // 正则表达式匹配 JSX 标签
  // 匹配自闭合标签 &lt;tag ... /&gt;，开始标签 &lt;tag ...&gt;，结束标签 &lt;/tag&gt;
  const tagPattern = /&lt;(\/?)([A-Za-z][A-Za-z0-9]*)(\s[^&gt;]*?)?(\/?)\s*&gt;/g;
  
  console.log('=== JSX 标签调试 ===\n');
  
  lines.forEach((line, index) =&gt; {
    const lineNum = index + 1;
    let match;
    const tagRegex = new RegExp(tagPattern.source, 'g'); // 重置正则表达式
    while ((match = tagRegex.exec(line)) !== null) {
      const [fullMatch, closingSlash, tagName, attrs, selfClosing] = match;
      
      if (selfClosing) {
        // 自闭合标签，跳过
        continue;
      }
      
      if (closingSlash) {
        // 结束标签
        const popped = stack.pop();
        if (!popped) {
          console.log(`❌ 第 ${lineNum} 行: 多余的结束标签 &lt;/${tagName}&gt;`);
        } else if (popped.tag !== tagName) {
          console.log(`❌ 第 ${lineNum} 行: 标签不匹配! 期望 &lt;/${popped.tag}&gt; (从第 ${popped.line} 行开始), 但得到 &lt;/${tagName}&gt;`);
          // 把弹出的标签放回去，继续检查
          stack.push(popped);
        } else {
          console.log(`✅ 第 ${lineNum} 行: 闭合标签 &lt;/${tagName}&gt; (匹配第 ${popped.line} 行)`);
        }
      } else {
        // 开始标签
        stack.push({ tag: tagName, line: lineNum });
        console.log(`🔹 第 ${lineNum} 行: 开始标签 &lt;${tagName}&gt;`);
      }
    }
  });
  
  console.log('\n=== 总结 ===');
  if (stack.length &gt; 0) {
    console.log(`❌ 有 ${stack.length} 个未闭合的标签:`);
    stack.forEach(item =&gt; {
      console.log(`   - &lt;${item.tag}&gt; 从第 ${item.line} 行开始`);
    });
  } else {
    console.log('✅ 所有标签都正确匹配!');
  }
}

debugJSX('src/renderer/features/settings/SettingsModal.tsx');

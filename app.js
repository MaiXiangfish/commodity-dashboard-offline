"use strict";

const state = {
  name: "示例数据",
  headers: [],
  rawRows: [],
  rows: [],
  mapping: {},
  filteredRows: [],
  aggregate: [],
  productSummary: [],
  anomalies: [],
  quality: {},
  selectedProducts: new Set(),
  productSearch: ""
};

const columnHints = {
  date: ["日期", "交易日期", "成交日期", "下单时间", "时间", "月份", "date", "trade_date", "order_date", "created_at"],
  product: ["商品", "商品名称", "品名", "产品", "产品名称", "sku", "货品", "物料", "品类", "category", "product", "item"],
  quantity: ["交易量", "成交量", "数量", "销量", "件数", "重量", "吨数", "volume", "quantity", "qty", "count"],
  price: ["交易价格", "成交价", "单价", "价格", "均价", "售价", "price", "unit_price", "avg_price"],
  amount: ["交易金额", "成交额", "交易额", "销售额", "金额", "收入", "amount", "value", "total", "gmv", "revenue"]
};

const el = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  loadSampleData();
});

function cacheElements() {
  [
    "fileInput", "sampleBtn", "clearBtn", "datasetName", "mappingPanel",
    "dateColumn", "productColumn", "quantityColumn", "priceColumn", "amountColumn",
    "startDate", "endDate", "periodSelect", "rollingSelect", "productSearch",
    "productSelect", "allProductsBtn", "kpiGrid", "insightsList",
    "trendChart", "productBarChart", "histogramChart", "amountChart", "scatterChart",
    "heatmapChart", "anomalyTable", "qualityTable", "previewTable", "tooltip",
    "exportSummaryBtn"
  ].forEach((id) => {
    el[id] = document.getElementById(id);
  });
}

function bindEvents() {
  el.fileInput.addEventListener("change", handleFile);
  el.sampleBtn.addEventListener("click", loadSampleData);
  el.clearBtn.addEventListener("click", clearData);
  ["dateColumn", "productColumn", "quantityColumn", "priceColumn", "amountColumn"].forEach((id) => {
    el[id].addEventListener("change", () => {
      state.mapping = readMappingFromControls();
      processRows();
      resetFiltersFromRows();
      render();
    });
  });
  ["startDate", "endDate", "periodSelect", "rollingSelect"].forEach((id) => {
    el[id].addEventListener("change", render);
  });
  el.productSearch.addEventListener("input", () => {
    state.productSearch = el.productSearch.value.trim();
    renderProductOptions();
  });
  el.productSelect.addEventListener("change", () => {
    state.selectedProducts = new Set(Array.from(el.productSelect.selectedOptions).map((option) => option.value));
    render();
  });
  el.allProductsBtn.addEventListener("click", () => {
    state.selectedProducts.clear();
    state.productSearch = "";
    el.productSearch.value = "";
    Array.from(el.productSelect.options).forEach((option) => {
      option.selected = false;
    });
    renderProductOptions();
    render();
  });
  el.exportSummaryBtn.addEventListener("click", exportSummaryCsv);
  document.querySelectorAll("[data-export]").forEach((button) => {
    button.addEventListener("click", () => exportSvg(button.dataset.export));
  });
}

function handleFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      loadCsvText(decodeCsvBuffer(reader.result), file.name);
    } catch (error) {
      showFatal(error.message || "CSV 解析失败");
    } finally {
      event.target.value = "";
    }
  };
  reader.onerror = () => showFatal("读取文件失败");
  reader.readAsArrayBuffer(file);
}

function decodeCsvBuffer(buffer) {
  const bytes = new Uint8Array(buffer || []);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount <= Math.max(3, utf8.length * 0.01)) return utf8;

  try {
    return new TextDecoder("gb18030").decode(bytes);
  } catch (_error) {
    return utf8;
  }
}

function loadSampleData() {
  loadCsvText(createSampleCsv(), "示例数据");
}

function loadCsvText(text, name) {
  const parsed = parseCsv(text);
  if (!parsed.headers.length || !parsed.rows.length) {
    throw new Error("没有识别到有效的表头和数据行");
  }
  state.name = name;
  state.headers = parsed.headers;
  state.rawRows = parsed.rows;
  state.mapping = detectMapping(parsed.headers);
  populateMappingControls();
  processRows();
  resetFiltersFromRows();
  renderProductOptions();
  render();
}

function clearData() {
  state.name = "未导入数据";
  state.headers = [];
  state.rawRows = [];
  state.rows = [];
  state.filteredRows = [];
  state.aggregate = [];
  state.productSummary = [];
  state.anomalies = [];
  state.quality = {};
  state.selectedProducts.clear();
  state.productSearch = "";
  el.productSearch.value = "";
  el.productSelect.innerHTML = "";
  el.mappingPanel.hidden = true;
  el.datasetName.textContent = state.name;
  ["startDate", "endDate"].forEach((id) => {
    el[id].value = "";
    el[id].min = "";
    el[id].max = "";
  });
  render();
}

function showFatal(message) {
  el.datasetName.textContent = `错误：${message}`;
}

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);

  const headers = (rows.shift() || []).map((header, index) => header.trim() || `列${index + 1}`);
  const dataRows = rows.map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] == null ? "" : values[index].trim();
    });
    return record;
  });
  return { headers, rows: dataRows };
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_\-()（）/]/g, "");
}

function detectMapping(headers) {
  const mapping = {};
  Object.entries(columnHints).forEach(([field, hints]) => {
    let best = "";
    let bestScore = -1;
    headers.forEach((header) => {
      const normalized = normalizeHeader(header);
      const score = hints.reduce((sum, hint) => {
        const normalizedHint = normalizeHeader(hint);
        if (normalized === normalizedHint) return sum + 5;
        if (normalized.includes(normalizedHint) || normalizedHint.includes(normalized)) return sum + 2;
        return sum;
      }, 0);
      if (score > bestScore) {
        best = header;
        bestScore = score;
      }
    });
    mapping[field] = bestScore > 0 ? best : "";
  });
  return mapping;
}

function populateMappingControls() {
  const controls = {
    dateColumn: "date",
    productColumn: "product",
    quantityColumn: "quantity",
    priceColumn: "price",
    amountColumn: "amount"
  };
  Object.entries(controls).forEach(([controlId, field]) => {
    const select = el[controlId];
    select.innerHTML = "";
    select.appendChild(new Option("未选择", ""));
    state.headers.forEach((header) => select.appendChild(new Option(header, header)));
    select.value = state.mapping[field] || "";
  });
  el.mappingPanel.hidden = false;
}

function readMappingFromControls() {
  return {
    date: el.dateColumn.value,
    product: el.productColumn.value,
    quantity: el.quantityColumn.value,
    price: el.priceColumn.value,
    amount: el.amountColumn.value
  };
}

function processRows() {
  const mapping = state.mapping;
  const quality = {
    rawRows: state.rawRows.length,
    validRows: 0,
    invalidDate: 0,
    missingProduct: 0,
    missingQuantity: 0,
    missingPrice: 0,
    missingAmount: 0,
    negativeQuantity: 0,
    negativePrice: 0,
    duplicateRows: 0
  };
  const seen = new Set();

  state.rows = state.rawRows.map((raw, index) => {
    const date = parseDate(raw[mapping.date]);
    const product = String(raw[mapping.product] || "未命名商品").trim() || "未命名商品";
    let quantity = parseNumber(raw[mapping.quantity]);
    let price = parseNumber(raw[mapping.price]);
    let amount = parseNumber(raw[mapping.amount]);

    if (!Number.isFinite(amount) && Number.isFinite(quantity) && Number.isFinite(price)) {
      amount = quantity * price;
    }
    if (!Number.isFinite(price) && Number.isFinite(amount) && Number.isFinite(quantity) && quantity !== 0) {
      price = amount / quantity;
    }

    if (!date) quality.invalidDate += 1;
    if (!product || product === "未命名商品") quality.missingProduct += 1;
    if (!Number.isFinite(quantity)) quality.missingQuantity += 1;
    if (!Number.isFinite(price)) quality.missingPrice += 1;
    if (!Number.isFinite(amount)) quality.missingAmount += 1;
    if (Number.isFinite(quantity) && quantity < 0) quality.negativeQuantity += 1;
    if (Number.isFinite(price) && price < 0) quality.negativePrice += 1;

    const normalized = {
      index: index + 1,
      raw,
      date,
      product,
      quantity,
      price,
      amount,
      valid: Boolean(date && product && Number.isFinite(quantity) && Number.isFinite(price))
    };

    const hash = JSON.stringify([formatDate(date), product, quantity, price, amount]);
    if (seen.has(hash)) quality.duplicateRows += 1;
    seen.add(hash);
    if (normalized.valid) quality.validRows += 1;
    return normalized;
  }).filter((row) => row.date);

  state.rows.sort((a, b) => a.date - b.date);
  state.quality = quality;
}

function parseNumber(value) {
  if (value == null || value === "") return NaN;
  let text = String(value).trim();
  if (!text) return NaN;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[￥¥$€£,%\s]/g, "").replace(/,/g, "");
  const number = Number(text);
  return Number.isFinite(number) ? (negative ? -number : number) : NaN;
}

function parseDate(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const epoch = Date.UTC(1899, 11, 30);
    return normalizeDate(new Date(epoch + serial * 86400000));
  }

  const cleaned = raw
    .replace(/[年月.]/g, "-")
    .replace(/日/g, "")
    .replace(/\//g, "-")
    .replace(/\s+.*/, "");
  const monthYearMatch = cleaned.match(/^(\d{1,2})-(\d{4})$/);
  if (monthYearMatch) {
    return normalizeDate(new Date(Number(monthYearMatch[2]), Number(monthYearMatch[1]) - 1, 1));
  }
  const match = cleaned.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (match) {
    return normalizeDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1)));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : normalizeDate(parsed);
}

function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function resetFiltersFromRows() {
  const validDates = state.rows.map((row) => row.date).filter(Boolean);
  if (!validDates.length) return;
  const min = new Date(Math.min(...validDates.map((date) => date.getTime())));
  const max = new Date(Math.max(...validDates.map((date) => date.getTime())));
  el.startDate.min = formatDate(min);
  el.startDate.max = formatDate(max);
  el.endDate.min = formatDate(min);
  el.endDate.max = formatDate(max);
  el.startDate.value = formatDate(min);
  el.endDate.value = formatDate(max);
  state.selectedProducts.clear();
}

function renderProductOptions() {
  const products = uniqueProducts();
  const query = state.productSearch.toLowerCase();
  const visible = products.filter((product) => product.toLowerCase().includes(query));
  el.productSelect.innerHTML = "";
  visible.forEach((product) => {
    const option = new Option(product, product);
    option.selected = state.selectedProducts.has(product);
    el.productSelect.appendChild(option);
  });
}

function uniqueProducts() {
  return Array.from(new Set(state.rows.map((row) => row.product))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function render() {
  el.datasetName.textContent = state.name;
  renderProductOptions();
  applyFilters();
  state.aggregate = aggregateRows(state.filteredRows, el.periodSelect.value);
  state.productSummary = summarizeProducts(state.filteredRows);
  state.anomalies = findAnomalies(state.filteredRows);

  renderKpis();
  renderInsights();
  drawTrendChart();
  drawProductBarChart();
  drawHistogramChart();
  drawAmountChart();
  drawScatterChart();
  drawHeatmapChart();
  renderAnomalyTable();
  renderQualityTable();
  renderPreviewTable();
}

function applyFilters() {
  const start = parseDate(el.startDate.value);
  const end = parseDate(el.endDate.value);
  state.filteredRows = state.rows.filter((row) => {
    if (start && row.date < start) return false;
    if (end && row.date > end) return false;
    if (state.selectedProducts.size && !state.selectedProducts.has(row.product)) return false;
    return row.valid;
  });
}

function aggregateRows(rows, period) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = periodKey(row.date, period);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: periodLabel(row.date, period),
        sort: periodSort(row.date, period),
        quantity: 0,
        amount: 0,
        priceWeightedAmount: 0,
        priceQuantity: 0,
        prices: [],
        count: 0
      });
    }
    const item = groups.get(key);
    item.quantity += safe(row.quantity);
    item.amount += safe(row.amount);
    item.priceWeightedAmount += safe(row.price) * Math.abs(safe(row.quantity));
    item.priceQuantity += Math.abs(safe(row.quantity));
    item.prices.push(row.price);
    item.count += 1;
  });
  return Array.from(groups.values())
    .map((item) => ({
      ...item,
      avgPrice: item.priceQuantity > 0 ? item.priceWeightedAmount / item.priceQuantity : mean(item.prices)
    }))
    .sort((a, b) => a.sort - b.sort);
}

function summarizeProducts(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row.product)) {
      groups.set(row.product, {
        product: row.product,
        quantity: 0,
        amount: 0,
        priceWeightedAmount: 0,
        priceQuantity: 0,
        prices: [],
        rows: []
      });
    }
    const item = groups.get(row.product);
    item.quantity += safe(row.quantity);
    item.amount += safe(row.amount);
    item.priceWeightedAmount += safe(row.price) * Math.abs(safe(row.quantity));
    item.priceQuantity += Math.abs(safe(row.quantity));
    item.prices.push(row.price);
    item.rows.push(row);
  });

  return Array.from(groups.values()).map((item) => {
    const sorted = item.rows.slice().sort((a, b) => a.date - b.date);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const avgPrice = item.priceQuantity > 0 ? item.priceWeightedAmount / item.priceQuantity : mean(item.prices);
    return {
      product: item.product,
      quantity: item.quantity,
      amount: item.amount,
      avgPrice,
      transactions: item.rows.length,
      volatility: avgPrice ? stddev(item.prices) / Math.abs(avgPrice) : 0,
      priceChange: first && last && first.price ? (last.price - first.price) / Math.abs(first.price) : 0
    };
  }).sort((a, b) => b.amount - a.amount);
}

function findAnomalies(rows) {
  const byProduct = new Map();
  rows.forEach((row) => {
    if (!byProduct.has(row.product)) byProduct.set(row.product, []);
    byProduct.get(row.product).push(row);
  });

  const anomalies = [];
  byProduct.forEach((items, product) => {
    const prices = items.map((row) => row.price).filter(Number.isFinite);
    const quantities = items.map((row) => row.quantity).filter(Number.isFinite);
    const priceMean = mean(prices);
    const priceStd = stddev(prices) || 1;
    const quantityMean = mean(quantities);
    const quantityStd = stddev(quantities) || 1;

    items.forEach((row) => {
      const priceScore = Math.abs((row.price - priceMean) / priceStd);
      const quantityScore = Math.abs((row.quantity - quantityMean) / quantityStd);
      const score = Math.max(priceScore, quantityScore);
      if (score >= 2.5 && items.length >= 6) {
        anomalies.push({
          date: row.date,
          product,
          price: row.price,
          quantity: row.quantity,
          amount: row.amount,
          reason: priceScore >= quantityScore ? "价格偏离" : "交易量偏离",
          score
        });
      }
    });
  });

  return anomalies.sort((a, b) => b.score - a.score).slice(0, 20);
}

function renderKpis() {
  const rows = state.filteredRows;
  const totalQuantity = sum(rows, "quantity");
  const totalAmount = sum(rows, "amount");
  const avgPrice = totalQuantity ? totalAmount / totalQuantity : mean(rows.map((row) => row.price));
  const productCount = new Set(rows.map((row) => row.product)).size;
  const dates = rows.map((row) => row.date.getTime());
  const days = dates.length ? Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / 86400000) + 1) : 0;
  const priceVolatility = avgPrice ? stddev(rows.map((row) => row.price)) / Math.abs(avgPrice) : 0;

  const cards = [
    ["交易量", formatNumber(totalQuantity), `日均 ${formatNumber(totalQuantity / Math.max(days, 1))}`],
    ["交易额", formatCurrency(totalAmount), `${rows.length} 笔交易`],
    ["加权均价", formatCurrency(avgPrice), "按交易量加权"],
    ["商品数", formatInteger(productCount), "当前筛选范围"],
    ["价格波动率", formatPercent(priceVolatility), "标准差 / 均价"],
    ["数据有效率", formatPercent(state.quality.rawRows ? state.quality.validRows / state.quality.rawRows : 0), `${state.quality.validRows || 0}/${state.quality.rawRows || 0} 行`]
  ];

  el.kpiGrid.innerHTML = cards.map(([label, value, note]) => `
    <article class="kpi-card">
      <div class="kpi-label">${escapeHtml(label)}</div>
      <div class="kpi-value">${escapeHtml(value)}</div>
      <div class="kpi-note">${escapeHtml(note)}</div>
    </article>
  `).join("");
}

function renderInsights() {
  if (!state.filteredRows.length) {
    el.insightsList.innerHTML = `<div class="insight"><strong>暂无数据</strong><span>调整日期或商品筛选。</span></div>`;
    return;
  }
  const topPeriod = maxBy(state.aggregate, "quantity");
  const topProduct = state.productSummary[0];
  const mostVolatile = state.productSummary.slice().sort((a, b) => b.volatility - a.volatility)[0];
  const biggestGain = state.productSummary.slice().sort((a, b) => b.priceChange - a.priceChange)[0];
  const biggestDrop = state.productSummary.slice().sort((a, b) => a.priceChange - b.priceChange)[0];
  const totalAmount = sum(state.filteredRows, "amount");

  const insights = [
    ["峰值周期", `${topPeriod ? topPeriod.label : "-"} 交易量最高，达到 ${formatNumber(topPeriod ? topPeriod.quantity : 0)}。`],
    ["头部商品", `${topProduct ? topProduct.product : "-"} 贡献 ${formatPercent(topProduct && totalAmount ? topProduct.amount / totalAmount : 0)} 交易额。`],
    ["波动商品", `${mostVolatile ? mostVolatile.product : "-"} 价格波动率为 ${formatPercent(mostVolatile ? mostVolatile.volatility : 0)}。`],
    ["价格上涨", `${biggestGain ? biggestGain.product : "-"} 区间首尾价格变化 ${formatPercent(biggestGain ? biggestGain.priceChange : 0)}。`],
    ["价格回落", `${biggestDrop ? biggestDrop.product : "-"} 区间首尾价格变化 ${formatPercent(biggestDrop ? biggestDrop.priceChange : 0)}。`],
    ["异常信号", state.anomalies.length ? `识别到 ${state.anomalies.length} 条异常波动。` : "未识别到显著异常。"]
  ];

  el.insightsList.innerHTML = insights.map(([title, body]) => `
    <div class="insight">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(body)}</span>
    </div>
  `).join("");
}

function drawTrendChart() {
  const rows = state.aggregate;
  const container = el.trendChart;
  if (!rows.length) return emptyChart(container);

  const width = 980;
  const height = 360;
  const margin = { top: 26, right: 72, bottom: 50, left: 72 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const maxQuantity = Math.max(...rows.map((row) => row.quantity), 1);
  const priceExtent = extent(rows.map((row) => row.avgPrice));
  const priceMin = priceExtent[0] === priceExtent[1] ? priceExtent[0] * 0.9 : priceExtent[0];
  const priceMax = priceExtent[0] === priceExtent[1] ? priceExtent[1] * 1.1 : priceExtent[1];
  const barW = Math.max(3, innerW / rows.length * 0.66);
  const x = (index) => margin.left + (rows.length === 1 ? innerW / 2 : (index / (rows.length - 1)) * innerW);
  const yQty = (value) => margin.top + innerH - (safe(value) / maxQuantity) * innerH;
  const yPrice = (value) => margin.top + innerH - ((safe(value) - priceMin) / Math.max(priceMax - priceMin, 1)) * innerH;
  const pricePath = makeLinePath(rows.map((row, index) => [x(index), yPrice(row.avgPrice)]));
  const rolling = movingAverage(rows.map((row) => row.avgPrice), Number(el.rollingSelect.value));
  const rollingPath = makeLinePath(rolling.map((value, index) => [x(index), yPrice(value)]).filter((point) => Number.isFinite(point[1])));
  const ticks = niceTicks(0, maxQuantity, 4);
  const priceTicks = niceTicks(priceMin, priceMax, 4);

  const bars = rows.map((row, index) => {
    const heightValue = margin.top + innerH - yQty(row.quantity);
    return `<rect class="bar" x="${x(index) - barW / 2}" y="${yQty(row.quantity)}" width="${barW}" height="${heightValue}" rx="3" data-tip="${escapeAttr(`${row.label}<br>交易量 ${formatNumber(row.quantity)}<br>均价 ${formatCurrency(row.avgPrice)}`)}"></rect>`;
  }).join("");

  const points = rows.map((row, index) => `<circle class="point" cx="${x(index)}" cy="${yPrice(row.avgPrice)}" r="4" data-tip="${escapeAttr(`${row.label}<br>均价 ${formatCurrency(row.avgPrice)}<br>交易额 ${formatCurrency(row.amount)}`)}"></circle>`).join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="交易量与价格波动">
      ${renderGrid(ticks, yQty, margin.left, width - margin.right)}
      ${ticks.map((tick) => `<text class="chart-label" x="${margin.left - 10}" y="${yQty(tick) + 4}" text-anchor="end">${formatCompact(tick)}</text>`).join("")}
      ${priceTicks.map((tick) => `<text class="chart-label" x="${width - margin.right + 10}" y="${yPrice(tick) + 4}">${formatCompact(tick)}</text>`).join("")}
      <line class="axis-line" x1="${margin.left}" y1="${margin.top + innerH}" x2="${width - margin.right}" y2="${margin.top + innerH}"></line>
      <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerH}"></line>
      <line class="axis-line" x1="${width - margin.right}" y1="${margin.top}" x2="${width - margin.right}" y2="${margin.top + innerH}"></line>
      ${bars}
      <path class="line-price" d="${pricePath}"></path>
      ${rollingPath ? `<path class="line-average" d="${rollingPath}"></path>` : ""}
      ${points}
      ${renderXAxisLabels(rows, x, margin.top + innerH + 24)}
      <text class="legend" x="${margin.left}" y="18">交易量</text>
      <text class="legend" x="${width - margin.right - 64}" y="18">加权均价</text>
    </svg>
  `;
  bindTooltip(container);
}

function drawAmountChart() {
  const rows = state.aggregate;
  const container = el.amountChart;
  if (!rows.length) return emptyChart(container);
  const width = 980;
  const height = 360;
  const margin = { top: 24, right: 26, bottom: 50, left: 72 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const maxAmount = Math.max(...rows.map((row) => row.amount), 1);
  const x = (index) => margin.left + (rows.length === 1 ? innerW / 2 : (index / (rows.length - 1)) * innerW);
  const y = (value) => margin.top + innerH - (safe(value) / maxAmount) * innerH;
  const linePoints = rows.map((row, index) => [x(index), y(row.amount)]);
  const linePath = makeLinePath(linePoints);
  const areaPath = `${linePath} L ${x(rows.length - 1)} ${margin.top + innerH} L ${x(0)} ${margin.top + innerH} Z`;
  const ticks = niceTicks(0, maxAmount, 4);
  const points = rows.map((row, index) => `<circle class="point" cx="${x(index)}" cy="${y(row.amount)}" r="4" data-tip="${escapeAttr(`${row.label}<br>交易额 ${formatCurrency(row.amount)}<br>${row.count} 笔`) }"></circle>`).join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="交易额走势">
      ${renderGrid(ticks, y, margin.left, width - margin.right)}
      ${ticks.map((tick) => `<text class="chart-label" x="${margin.left - 10}" y="${y(tick) + 4}" text-anchor="end">${formatCompact(tick)}</text>`).join("")}
      <line class="axis-line" x1="${margin.left}" y1="${margin.top + innerH}" x2="${width - margin.right}" y2="${margin.top + innerH}"></line>
      <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerH}"></line>
      <path class="area" d="${areaPath}"></path>
      <path class="line-amount" d="${linePath}"></path>
      ${points}
      ${renderXAxisLabels(rows, x, margin.top + innerH + 24)}
      <text class="legend" x="${margin.left}" y="18">交易额</text>
    </svg>
  `;
  bindTooltip(container);
}

function drawProductBarChart() {
  const data = state.productSummary.slice(0, 12);
  const container = el.productBarChart;
  if (!data.length) return emptyChart(container);
  const width = 680;
  const height = Math.max(360, data.length * 32 + 84);
  const margin = { top: 28, right: 32, bottom: 34, left: 138 };
  const innerW = width - margin.left - margin.right;
  const maxAmount = Math.max(...data.map((item) => item.amount), 1);
  const rowH = 26;
  const bars = data.map((item, index) => {
    const y = margin.top + index * rowH;
    const w = (item.amount / maxAmount) * innerW;
    return `
      <text class="chart-label" x="${margin.left - 10}" y="${y + 17}" text-anchor="end">${escapeSvg(truncate(item.product, 12))}</text>
      <rect class="bar secondary" x="${margin.left}" y="${y + 4}" width="${Math.max(w, 2)}" height="16" rx="3" data-tip="${escapeAttr(`${item.product}<br>交易额 ${formatCurrency(item.amount)}<br>交易量 ${formatNumber(item.quantity)}<br>均价 ${formatCurrency(item.avgPrice)}`)}"></rect>
      <text class="chart-label" x="${margin.left + Math.max(w, 2) + 8}" y="${y + 17}">${formatCompact(item.amount)}</text>
    `;
  }).join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="商品贡献">
      ${bars}
      <line class="axis-line" x1="${margin.left}" y1="${margin.top + data.length * rowH + 6}" x2="${width - margin.right}" y2="${margin.top + data.length * rowH + 6}"></line>
      <text class="legend" x="${margin.left}" y="18">按交易额排序</text>
    </svg>
  `;
  bindTooltip(container);
}

function drawHistogramChart() {
  const prices = state.filteredRows.map((row) => row.price).filter(Number.isFinite);
  const container = el.histogramChart;
  if (!prices.length) return emptyChart(container);
  const width = 680;
  const height = 360;
  const margin = { top: 28, right: 24, bottom: 48, left: 54 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const [minPrice, maxPrice] = extent(prices);
  const binCount = Math.min(12, Math.max(5, Math.round(Math.sqrt(prices.length))));
  const step = (maxPrice - minPrice || 1) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    min: minPrice + index * step,
    max: minPrice + (index + 1) * step,
    count: 0
  }));
  prices.forEach((price) => {
    const index = Math.min(binCount - 1, Math.floor((price - minPrice) / step));
    bins[index].count += 1;
  });
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
  const barGap = 7;
  const barW = innerW / bins.length - barGap;
  const y = (value) => margin.top + innerH - (value / maxCount) * innerH;
  const ticks = niceTicks(0, maxCount, 4);
  const bars = bins.map((bin, index) => {
    const x = margin.left + index * (innerW / bins.length) + barGap / 2;
    const h = margin.top + innerH - y(bin.count);
    return `<rect class="bar" x="${x}" y="${y(bin.count)}" width="${barW}" height="${h}" rx="3" data-tip="${escapeAttr(`${formatCurrency(bin.min)} - ${formatCurrency(bin.max)}<br>${bin.count} 笔交易`)}"></rect>`;
  }).join("");
  const labels = bins.map((bin, index) => {
    if (index % Math.ceil(bins.length / 5) !== 0) return "";
    const x = margin.left + index * (innerW / bins.length) + barW / 2;
    return `<text class="chart-label" x="${x}" y="${height - 18}" text-anchor="middle">${formatCompact(bin.min)}</text>`;
  }).join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="价格分布">
      ${renderGrid(ticks, y, margin.left, width - margin.right)}
      ${ticks.map((tick) => `<text class="chart-label" x="${margin.left - 8}" y="${y(tick) + 4}" text-anchor="end">${formatCompact(tick)}</text>`).join("")}
      <line class="axis-line" x1="${margin.left}" y1="${margin.top + innerH}" x2="${width - margin.right}" y2="${margin.top + innerH}"></line>
      ${bars}
      ${labels}
      <text class="legend" x="${margin.left}" y="18">交易价格区间</text>
    </svg>
  `;
  bindTooltip(container);
}

function drawScatterChart() {
  const rows = downsample(state.filteredRows, 700).filter((row) => Number.isFinite(row.quantity) && Number.isFinite(row.price));
  const container = el.scatterChart;
  if (!rows.length) return emptyChart(container);
  const width = 680;
  const height = 360;
  const margin = { top: 28, right: 24, bottom: 48, left: 62 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const qExtent = extent(rows.map((row) => row.quantity));
  const pExtent = extent(rows.map((row) => row.price));
  const x = (value) => margin.left + ((value - qExtent[0]) / Math.max(qExtent[1] - qExtent[0], 1)) * innerW;
  const y = (value) => margin.top + innerH - ((value - pExtent[0]) / Math.max(pExtent[1] - pExtent[0], 1)) * innerH;
  const xTicks = niceTicks(qExtent[0], qExtent[1], 4);
  const yTicks = niceTicks(pExtent[0], pExtent[1], 4);
  const points = rows.map((row) => `<circle class="scatter-point" cx="${x(row.quantity)}" cy="${y(row.price)}" r="${Math.min(8, Math.max(3, Math.sqrt(Math.abs(safe(row.amount))) / 120))}" data-tip="${escapeAttr(`${formatDate(row.date)}<br>${row.product}<br>交易量 ${formatNumber(row.quantity)}<br>价格 ${formatCurrency(row.price)}`)}"></circle>`).join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="量价散点">
      ${renderGrid(yTicks, y, margin.left, width - margin.right)}
      ${yTicks.map((tick) => `<text class="chart-label" x="${margin.left - 8}" y="${y(tick) + 4}" text-anchor="end">${formatCompact(tick)}</text>`).join("")}
      ${xTicks.map((tick) => `<text class="chart-label" x="${x(tick)}" y="${height - 18}" text-anchor="middle">${formatCompact(tick)}</text>`).join("")}
      <line class="axis-line" x1="${margin.left}" y1="${margin.top + innerH}" x2="${width - margin.right}" y2="${margin.top + innerH}"></line>
      <line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerH}"></line>
      ${points}
      <text class="legend" x="${margin.left}" y="18">横轴交易量，纵轴价格</text>
    </svg>
  `;
  bindTooltip(container);
}

function drawHeatmapChart() {
  const rows = state.filteredRows;
  const container = el.heatmapChart;
  if (!rows.length) return emptyChart(container);
  const monthly = aggregateRows(rows, "month");
  const years = Array.from(new Set(monthly.map((item) => item.sort.getFullYear()))).sort();
  const byKey = new Map(monthly.map((item) => [item.key, item]));
  const width = 680;
  const height = Math.max(320, years.length * 48 + 90);
  const margin = { top: 36, right: 24, bottom: 34, left: 58 };
  const cellW = (width - margin.left - margin.right) / 12;
  const cellH = 34;
  const maxAmount = Math.max(...monthly.map((item) => item.amount), 1);
  const months = Array.from({ length: 12 }, (_, index) => index + 1);
  const monthLabels = months.map((month) => `<text class="chart-label" x="${margin.left + (month - 0.5) * cellW}" y="${margin.top - 10}" text-anchor="middle">${month}月</text>`).join("");
  const cells = years.map((year, rowIndex) => {
    const y = margin.top + rowIndex * (cellH + 10);
    const label = `<text class="chart-label" x="${margin.left - 14}" y="${y + 22}" text-anchor="end">${year}</text>`;
    const monthCells = months.map((month) => {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      const item = byKey.get(key);
      const intensity = item ? item.amount / maxAmount : 0;
      const fill = heatColor(intensity);
      return `<rect class="heat-cell" x="${margin.left + (month - 1) * cellW}" y="${y}" width="${cellW - 3}" height="${cellH}" rx="5" fill="${fill}" data-tip="${escapeAttr(`${year}-${String(month).padStart(2, "0")}<br>交易额 ${formatCurrency(item ? item.amount : 0)}<br>交易量 ${formatNumber(item ? item.quantity : 0)}`)}"></rect>`;
    }).join("");
    return label + monthCells;
  }).join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="月度交易额热力图">
      ${monthLabels}
      ${cells}
      <text class="legend" x="${margin.left}" y="18">颜色越深，交易额越高</text>
    </svg>
  `;
  bindTooltip(container);
}

function renderAnomalyTable() {
  if (!state.anomalies.length) {
    el.anomalyTable.innerHTML = `<div class="empty-state">未识别到显著异常</div>`;
    return;
  }
  const rows = state.anomalies.map((item) => [
    formatDate(item.date),
    item.product,
    item.reason,
    formatCurrency(item.price),
    formatNumber(item.quantity),
    formatCurrency(item.amount),
    item.score.toFixed(2)
  ]);
  el.anomalyTable.innerHTML = tableHtml(["日期", "商品", "类型", "价格", "交易量", "交易额", "强度"], rows);
}

function renderQualityTable() {
  const q = state.quality;
  const checks = [
    ["原始行数", formatInteger(q.rawRows || 0), "good"],
    ["有效行数", formatInteger(q.validRows || 0), "good"],
    ["无效日期", formatInteger(q.invalidDate || 0), q.invalidDate ? "warn" : "good"],
    ["缺失商品", formatInteger(q.missingProduct || 0), q.missingProduct ? "warn" : "good"],
    ["缺失交易量", formatInteger(q.missingQuantity || 0), q.missingQuantity ? "warn" : "good"],
    ["缺失价格", formatInteger(q.missingPrice || 0), q.missingPrice ? "warn" : "good"],
    ["缺失金额", formatInteger(q.missingAmount || 0), q.missingAmount ? "warn" : "good"],
    ["负交易量", formatInteger(q.negativeQuantity || 0), q.negativeQuantity ? "warn" : "good"],
    ["负价格", formatInteger(q.negativePrice || 0), q.negativePrice ? "warn" : "good"],
    ["疑似重复", formatInteger(q.duplicateRows || 0), q.duplicateRows ? "warn" : "good"]
  ];
  el.qualityTable.innerHTML = tableHtml(["检查项", "结果", "状态"], checks.map(([name, value, type]) => [
    name,
    value,
    `<span class="badge ${type}">${type === "warn" ? "需关注" : "正常"}</span>`
  ]), true);
}

function renderPreviewTable() {
  const rows = state.filteredRows.slice(0, 120).map((row) => [
    formatDate(row.date),
    row.product,
    formatNumber(row.quantity),
    formatCurrency(row.price),
    formatCurrency(row.amount)
  ]);
  el.previewTable.innerHTML = rows.length
    ? tableHtml(["日期", "商品", "交易量", "交易价格", "交易金额"], rows)
    : `<div class="empty-state">暂无明细</div>`;
}

function tableHtml(headers, rows, allowHtml = false) {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${allowHtml ? cell : escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function exportSummaryCsv() {
  if (!state.aggregate.length) return;
  const lines = [
    ["周期", "交易量", "交易额", "加权均价", "交易笔数"],
    ...state.aggregate.map((item) => [item.label, item.quantity, item.amount, item.avgPrice, item.count])
  ];
  downloadText(`交易汇总_${timestamp()}.csv`, toCsv(lines), "text/csv;charset=utf-8");
}

function exportSvg(containerId) {
  const svg = el[containerId].querySelector("svg");
  if (!svg) return;
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!clone.getAttribute("width")) {
    const viewBox = clone.getAttribute("viewBox");
    const parts = viewBox ? viewBox.split(/\s+/).map(Number) : [];
    clone.setAttribute("width", String(parts[2] || 1000));
    clone.setAttribute("height", String(parts[3] || 600));
  }
  clone.querySelectorAll("[data-tip]").forEach((node) => node.removeAttribute("data-tip"));
  const source = `<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`;
  downloadText(`${containerId}_${timestamp()}.svg`, source, "image/svg+xml;charset=utf-8");
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toCsv(lines) {
  return lines.map((line) => line.map((value) => {
    const text = String(value == null ? "" : value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
  }).join(",")).join("\n");
}

function emptyChart(container) {
  container.innerHTML = `<div class="empty-state">暂无可视化数据</div>`;
}

function renderGrid(ticks, yScale, x1, x2) {
  return ticks.map((tick) => `<line class="grid-line" x1="${x1}" y1="${yScale(tick)}" x2="${x2}" y2="${yScale(tick)}"></line>`).join("");
}

function renderXAxisLabels(rows, xScale, y) {
  if (!rows.length) return "";
  const step = Math.max(1, Math.ceil(rows.length / 8));
  return rows.map((row, index) => {
    if (index % step !== 0 && index !== rows.length - 1) return "";
    return `<text class="chart-label" x="${xScale(index)}" y="${y}" text-anchor="middle">${escapeSvg(row.label)}</text>`;
  }).join("");
}

function bindTooltip(container) {
  container.querySelectorAll("[data-tip]").forEach((node) => {
    node.addEventListener("mouseenter", (event) => {
      el.tooltip.textContent = event.currentTarget.dataset.tip.replace(/<br\s*\/?>/gi, "\n");
      el.tooltip.hidden = false;
    });
    node.addEventListener("mousemove", (event) => {
      const pad = 14;
      const rect = el.tooltip.getBoundingClientRect();
      let left = event.clientX + pad;
      let top = event.clientY + pad;
      if (left + rect.width > window.innerWidth) left = event.clientX - rect.width - pad;
      if (top + rect.height > window.innerHeight) top = event.clientY - rect.height - pad;
      el.tooltip.style.left = `${Math.max(8, left)}px`;
      el.tooltip.style.top = `${Math.max(8, top)}px`;
    });
    node.addEventListener("mouseleave", () => {
      el.tooltip.hidden = true;
    });
  });
}

function periodKey(date, period) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (period === "day") return formatDate(date);
  if (period === "week") return `${year}-W${String(isoWeek(date)).padStart(2, "0")}`;
  if (period === "quarter") return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  if (period === "year") return `${year}`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function periodLabel(date, period) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (period === "day") return formatDate(date);
  if (period === "week") return `${year} 第${isoWeek(date)}周`;
  if (period === "quarter") return `${year} Q${Math.floor((month - 1) / 3) + 1}`;
  if (period === "year") return `${year}`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function periodSort(date, period) {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (period === "week") {
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return weekStart;
  }
  if (period === "quarter") return new Date(year, Math.floor(month / 3) * 3, 1);
  if (period === "year") return new Date(year, 0, 1);
  if (period === "month") return new Date(year, month, 1);
  return date;
}

function isoWeek(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
}

function makeLinePath(points) {
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${round(point[0])} ${round(point[1])}`).join(" ");
}

function movingAverage(values, windowSize) {
  if (!windowSize) return [];
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    return mean(values.slice(start, index + 1));
  });
}

function niceTicks(min, max, count) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min || 0];
  const span = max - min;
  const rawStep = span / Math.max(1, count);
  const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / power;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = nice * power;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(round(value));
  }
  return ticks;
}

function extent(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [0, 1];
  return [Math.min(...finite), Math.max(...finite)];
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + safe(row[key]), 0);
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((total, value) => total + value, 0) / finite.length : 0;
}

function stddev(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return 0;
  const avg = mean(finite);
  const variance = mean(finite.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function maxBy(rows, key) {
  return rows.reduce((best, row) => (!best || row[key] > best[key] ? row : best), null);
}

function downsample(rows, maxCount) {
  if (rows.length <= maxCount) return rows;
  const step = rows.length / maxCount;
  return Array.from({ length: maxCount }, (_, index) => rows[Math.floor(index * step)]);
}

function safe(value) {
  return Number.isFinite(value) ? value : 0;
}

function formatDate(date) {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatNumber(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value) : "-";
}

function formatInteger(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value) : "-";
}

function formatCurrency(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value)
    : "-";
}

function formatPercent(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 }).format(value)
    : "-";
}

function formatCompact(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : "-";
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function truncate(value, length) {
  const text = String(value);
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function timestamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

function heatColor(intensity) {
  const colors = [
    [238, 242, 246],
    [204, 235, 230],
    [77, 170, 155],
    [15, 118, 110],
    [12, 74, 110]
  ];
  const scaled = Math.max(0, Math.min(1, intensity)) * (colors.length - 1);
  const low = Math.floor(scaled);
  const high = Math.min(colors.length - 1, low + 1);
  const ratio = scaled - low;
  const rgb = colors[low].map((channel, index) => Math.round(channel + (colors[high][index] - channel) * ratio));
  return `rgb(${rgb.join(",")})`;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeSvg(value) {
  return escapeHtml(value);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function createSampleCsv() {
  const products = [
    ["冷轧钢卷", 5200, 140],
    ["电解铜", 68500, 18],
    ["聚丙烯", 8100, 95],
    ["天然橡胶", 13200, 56],
    ["玻璃原片", 1780, 210],
    ["铝锭", 19100, 36],
    ["棉纱", 23600, 22]
  ];
  const rows = [["交易日期", "商品名称", "成交量", "成交单价", "成交金额"]];
  for (let monthIndex = 0; monthIndex < 36; monthIndex += 1) {
    const date = new Date(2023, 0 + monthIndex, 1);
    products.forEach(([name, basePrice, baseQty], productIndex) => {
      const seasonal = 1 + Math.sin((monthIndex + productIndex) / 2.7) * 0.08;
      const trend = 1 + (monthIndex - 18) * (productIndex % 2 ? -0.002 : 0.003);
      const pulse = monthIndex === 16 && productIndex === 1 ? 1.22 : monthIndex === 27 && productIndex === 3 ? 0.84 : 1;
      const price = Math.round(basePrice * seasonal * trend * pulse * 100) / 100;
      const qtyWave = 1 + Math.cos((monthIndex + productIndex * 2) / 3.1) * 0.16;
      const quantity = Math.round(baseQty * qtyWave * (1 + (monthIndex % 12 === 10 ? 0.18 : 0)));
      const day = 4 + ((monthIndex + productIndex * 3) % 22);
      const tradeDate = new Date(date.getFullYear(), date.getMonth(), day);
      const amount = Math.round(price * quantity * 100) / 100;
      rows.push([formatDate(tradeDate), name, quantity, price, amount]);
    });
  }
  return toCsv(rows);
}

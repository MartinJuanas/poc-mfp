export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

/**
 * Cliente API para el backend
 */
class ApiClient {
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;

    const config = { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } };
    if (options.body instanceof FormData) delete config.headers['Content-Type'];
    let response;
    try { response = await fetch(url, config); }
    catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('No pudimos conectarnos. Verificá tu conexión e intentá nuevamente.');
    }
    let data;
    try { data = await response.json(); }
    catch { throw new Error('El servidor devolvió una respuesta inesperada. Intentá nuevamente.'); }
    if (!response.ok || data.success === false) { const error = new Error(data.error || 'No pudimos completar la solicitud.'); error.status=response.status; throw error; }

    return data;
  }

  // RECEIPTS
  async getReceipts() {
    return this.request("/receipts");
  }

  async getReceiptStats() {
    return this.request("/receipts/stats");
  }

  async uploadReceipt(file) {
    const formData = new FormData();
    formData.append("pdf", file);

    return this.request("/receipts/upload", {
      method: "POST",
      body: formData,
    });
  }

  async analyzeReceipt(file) {
    const formData = new FormData();
    formData.append("pdf", file);
    return this.request("/receipts/analyze", {
      method: "POST",
      body: formData,
    });
  }

  async createReceipt(data) {
    return this.request("/receipts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateReceipt(id, data) {
    return this.request(`/receipts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async calculateReceipt(data) {
    return this.request("/receipts/calculate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async importFromFolder(folderPath) {
    return this.request("/receipts/import-folder", {
      method: "POST",
      body: JSON.stringify({ folderPath }),
    });
  }

  async deleteReceipt(id) {
    return this.request(`/receipts/${id}`, {
      method: "DELETE",
    });
  }

  async compareReceipts(idA, idB) {
    return this.request(`/receipts/compare?idA=${idA}&idB=${idB}`);
  }

  // BULK RECEIPTS
  async startBulkImport(files, relativePaths = []) {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("pdfs", file);
    });
    formData.append("relativePaths", JSON.stringify(relativePaths));

    return this.request("/receipts/bulk", {
      method: "POST",
      body: formData,
    });
  }

  async getBulkImportStatus(batchId) {
    return this.request(`/receipts/bulk/${batchId}`);
  }

  async retryBulkFailed(batchId, files = [], indices = []) {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("pdfs", file);
    });
    formData.append("indices", JSON.stringify(indices));

    return this.request(`/receipts/bulk/${batchId}/retry`, {
      method: "POST",
      body: formData,
    });
  }

  async retryBulkFile(batchId, fileIndex, file) {
    const formData = new FormData();
    formData.append("pdf", file);

    return this.request(`/receipts/bulk/${batchId}/files/${fileIndex}/retry`, {
      method: "POST",
      body: formData,
    });
  }

  async reviewBulkFile(batchId, fileIndex, year, month, montoNeto) {
    return this.request(`/receipts/bulk/${batchId}/files/${fileIndex}/review`, {
      method: "POST",
      body: JSON.stringify({ year, month, montoNeto }),
    });
  }

  async deleteBulkImport(batchId) {
    return this.request(`/receipts/bulk/${batchId}`, {
      method: "DELETE",
    });
  }

  // GOALS
  async getGoals(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    return this.request(`/goals${params ? "?" + params : ""}`);
  }

  async getGoalsSummary() {
    return this.request("/goals/summary");
  }

  async createGoal(goal) {
    return this.request("/goals", {
      method: "POST",
      body: JSON.stringify(goal),
    });
  }

  async updateGoal(id, updates) {
    return this.request(`/goals/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async addContribution(goalId, monto, descripcion) {
    return this.request(`/goals/${goalId}/aportes`, {
      method: "POST",
      body: JSON.stringify({ monto, descripcion }),
    });
  }

  async deleteGoal(id) {
    return this.request(`/goals/${id}`, {
      method: "DELETE",
    });
  }

  // EXPENSES
  async getExpenses(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    return this.request(`/expenses${params ? "?" + params : ""}`);
  }

  async getExpensesSummary(mes, anio) {
    return this.request(`/expenses/summary?mes=${mes}&anio=${anio}`);
  }

  async getCategorias() {
    return this.request("/expenses/categorias");
  }

  async createExpense(data) {
    return this.request("/expenses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateExpense(id, data) {
    return this.request(`/expenses/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteExpense(id) {
    return this.request(`/expenses/${id}`, {
      method: "DELETE",
    });
  }

  // CURRENCY
  async getCurrencyRates() {
    return this.request("/currency");
  }

  async refreshCurrencyRates() {
    return this.request("/currency/refresh");
  }

  async convertToUSD(amount, tipo = "oficial") {
    return this.request("/currency/convert", {
      method: "POST",
      body: JSON.stringify({ amount, tipo }),
    });
  }
}

export const api = new ApiClient();
export default api;

# AI 技術落地與安全治理的實作方式

## 一、「理解系統」比「AI 說沒問題」更重要

1. **日誌標準化 (Structured Logging)**
   * 在 .NET 中統一使用 Serilog 或 Microsoft.Extensions.Logging。
   * 在呼叫 AI API 的前後、執行 Agent 任務時，把 **Prompt**、**Token 消耗量**、**回應時間** 以及 **Exception** 用 JSON 格式完整記錄下來。

2. **集中化監控**
   * 把 Log 吐到 Azure Application Insights 或 GCP Cloud Logging。
   * 發生異常時，工程師要能第一時間用 KQL（Kusto）或 Log Explorer 撈出整個呼叫鏈（Correlation ID），靠硬實力看 Log 抓出是哪一行的 Code 或是哪一個 Prompt 壞掉。

---

## 二、Pipeline 將逐步納入 Multi 驗證

1. **現有機制強制化 (Quality Gates)**
   * 現有的「原碼掃描」和 `NuGetAudit` / `npm audit`。

2. **分支策略 (Branch Policies)**
   * 設定 Azure DevOps，規定程式碼一定要通過 Pipeline 綠燈，並且一定要拿到 2 位 Approver (雙人審查) 的核准才能自動 Merge。

3. **引入 AI 助教**
   * 在 Pipeline 中多加一站（Step），利用 Azure DevOps 整合 Copilot API 或其他 AI 工具，在 PR 送出時自動留言（Comment）指出「這段 Code 的效能風險或潛在 Bug」。

---

## 三、AI 存取內部資源一律走認證閘道

1. 逐步導入 **Workload Identity Federation (工作負載身分識別同盟)**，讓 Azure 的 Managed Identity (受控身分) 直接用 OIDC 機制去跟 GCP 握手「換取」臨時 Token。

---

## 四、資料餵給 AI 前先做好分級保護

1. **切分「開發環境（地端）」與「正式環境（雲端）」的資安層級**
   * **地端（開發）：** 每個工程師用自己的電腦跑 `dotnet user-secrets`，密碼存放在自己電腦的 User Profile 底下。
   * **雲端（維運）：** 統一由 Azure Key Vault 或雲端環境變數（Environment Variables）動態注入，落實了「職責分離（Separation of Duties）」的安全原則。

2. **發送請求給 Gemini API 的前一刻，過濾機敏資料**
   * 後端寫一個自訂的 `HttpClient MessageHandler`，或者掛載 `Filter`。
   * 在發送請求給 Gemini API 的前一刻，過濾器自動用 Regex（常規表示式）掃描字串，用來過濾「客戶身分證、信用卡、商業機密」。
   * 抓到身分證、手機號碼、Email $\rightarrow$ 自動過濾成 `A12377****`（去識別化，符合 ISO 27701 / 個資法）。
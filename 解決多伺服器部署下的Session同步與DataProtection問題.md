# 解決多伺服器部署下的 Session 同步與 Data Protection 問題

## 前言

當應用程式部署在多台伺服器上時，會面臨一些挑戰，其中最常見的是 **Session 同步**與 **Data Protection** 問題。如果每台伺服器的狀態（例如 Session 或用來加密資料的金鑰）無法同步，就會導致使用者在不同伺服器間切換時，出現登入狀態遺失或資料解密失敗等錯誤。

本文將分享如何透過將 Session 與 Data Protection 金鑰集中存放在 **MongoDB** 中，來解決這個問題。

## 問題概述

  - **Session 不同步：** 每個使用者在單一伺服器上建立 Session，當負載平衡將使用者導向另一台伺服器時，後者無法讀取原先的 Session，導致狀態遺失。
  - **Data Protection 失敗：** 在 ASP.NET Core 中，`Data Protection` 服務負責加密與解密敏感資料（如防偽造 Token、OAuth Token 等）。如果應用程式部署在多台伺服器上，且未共用相同的金鑰，就會導致驗證失敗。最典型的例子是使用 `@Html.AntiForgeryToken()` 產生的 Token，在後端透過 `[ValidateAntiForgeryToken]` 驗證時，會因為金鑰不一致而驗證失敗。

## 解決方案

我們的解決方案是將 ASP.NET Core 的 `Distributed Cache` 與 `Data Protection` 服務與 **MongoDB** 整合，讓所有伺服器都從同一個地方讀取和寫入 Session 狀態及加密金鑰。

### 專案架構

假設專案名稱為 `MyWeb`，其多層架構如下：

```
MyWeb
├── MyWeb.Common
├── MyWeb.Data
└── MyWeb.Services
```

### 實作步驟

#### 1\. 註冊 Session 與 Data Protection 服務 (`MyWeb/Program.cs`)

在 `Program.cs` 檔案中，我們設定服務以使用 MongoDB 作為分散式快取和金鑰儲存庫。

```csharp
// 設定 MongoDB 連線字串
var brandDomainMongoDbConnectionString = builder.Configuration["BrandDomainMongoDbConnectionString"]!;
var BrandDomainMongoDbName = builder.Configuration["BrandDomainMongoDb"]!;

// 使用自訂的擴充方法來註冊服務
builder.Services.AddMongoDbDistributedCache(
    brandDomainMongoDbConnectionString,
    BrandDomainMongoDbName,  // 您想要的資料庫名稱
    "WebDistributedCache"    // 您想要的集合名稱
);

#region 註冊 Data Protection 服務，並指定將密鑰存入 MongoDB
// 註冊 Data Protection 服務，並指定將密鑰存入 MongoDB
builder.Services
    .AddDataProtection()
    .PersistKeysToMongoDb(provider => provider.GetRequiredService<IMongoDatabase>(),
    "DataProtectionKeys");
#endregion

// 註冊 Session 服務
builder.Services.AddSession(options =>
{
    // 您可以在這裡設定 Session 的選項，例如 Session 過期時間
    options.IdleTimeout = TimeSpan.FromMinutes(20);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
});
```

#### 2\. 自訂 MongoDB 分散式快取 (`MyWeb.Common/MongoDBDistributedCache.cs`)

我們需要實作 `IDistributedCache` 介面，以定義如何將快取資料存入 MongoDB。

```csharp
using BrandDomainWeb.Common.Configuration;
using MongoDB.Driver;
using Microsoft.Extensions.Caching.Distributed;

namespace BrandDomainWeb.Data.Cache
{
    public class MongoDBDistributedCache : IDistributedCache
    {
        private readonly IMongoCollection<CacheEntry> _cacheCollection;

        public MongoDBDistributedCache(IMongoCollection<CacheEntry> cacheCollection)
        {
            _cacheCollection = cacheCollection;
        }

        public byte[] Get(string key)
        {
            var entry = _cacheCollection.Find(x => x.Id == key).FirstOrDefault();
            if (entry == null)
            {
                return null;
            }

            // 更新最後存取時間以支援滑動過期
            if (entry.SlidingExpiration.HasValue)
            {
                entry.LastAccessTime = DateTime.UtcNow;
                _cacheCollection.ReplaceOne(x => x.Id == key, entry);
            }

            return entry.Value;
        }

        public async Task<byte[]?> GetAsync(string key, CancellationToken token = default)
        {
            var entry = await _cacheCollection.Find(x => x.Id == key).FirstOrDefaultAsync(token);
            if (entry == null)
            {
                return null;
            }

            if (entry.SlidingExpiration.HasValue)
            {
                entry.LastAccessTime = DateTime.UtcNow;
                await _cacheCollection.ReplaceOneAsync(x => x.Id == key, entry, new ReplaceOptions(), token);
            }

            return entry.Value;
        }

        public void Refresh(string key)
        {
            var entry = _cacheCollection.Find(x => x.Id == key).FirstOrDefault();
            if (entry != null && entry.SlidingExpiration.HasValue)
            {
                entry.LastAccessTime = DateTime.UtcNow;
                _cacheCollection.ReplaceOne(x => x.Id == key, entry);
            }
        }

        public async Task RefreshAsync(string key, CancellationToken token = default)
        {
            var entry = await _cacheCollection.Find(x => x.Id == key).FirstOrDefaultAsync(token);
            if (entry != null && entry.SlidingExpiration.HasValue)
            {
                entry.LastAccessTime = DateTime.UtcNow;
                await _cacheCollection.ReplaceOneAsync(x => x.Id == key, entry, new ReplaceOptions(), token);
            }
        }

        public void Remove(string key)
        {
            _cacheCollection.DeleteOne(x => x.Id == key);
        }

        public async Task RemoveAsync(string key, CancellationToken token = default)
        {
            await _cacheCollection.DeleteOneAsync(x => x.Id == key, token);
        }


        public void Set(string key, byte[] value, DistributedCacheEntryOptions options)
        {
            var entry = new CacheEntry
            {
                Id = key,
                Value = value,
                AbsoluteExpiration = options.AbsoluteExpiration?.UtcDateTime,
                SlidingExpiration = options.SlidingExpiration,
                LastAccessTime = DateTime.UtcNow
            };

            // 使用 upsert 模式，如果存在則更新，不存在則新增
            _cacheCollection.ReplaceOne(x => x.Id == key, entry, new ReplaceOptions { IsUpsert = true });
        }

        public async Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default)
        {
            var entry = new CacheEntry
            {
                Id = key,
                Value = value,
                AbsoluteExpiration = options.AbsoluteExpiration?.UtcDateTime,
                SlidingExpiration = options.SlidingExpiration,
                LastAccessTime = DateTime.UtcNow
            };

            await _cacheCollection.ReplaceOneAsync(x => x.Id == key, entry, new ReplaceOptions { IsUpsert = true }, token);
        }
    }
}
```

#### 3\. 服務擴充方法 (`MyWeb.Common/CacheServiceCollectionExtensions.cs`)

為了讓 `Program.cs` 中的程式碼更簡潔，我們建立一個服務擴充方法來處理 MongoDB 的依賴注入。

```csharp
using BrandDomainWeb.Common.Configuration;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;

namespace BrandDomainWeb.Data.Cache
{
    public static class CacheServiceCollectionExtensions
    {
        public static IServiceCollection AddMongoDbDistributedCache(
            this IServiceCollection services,
            string connectionString,
            string databaseName,
            string collectionName)
        {
            // 註冊 MongoDB 用戶端
            services.AddSingleton<IMongoClient>(new MongoClient(connectionString));

            // 註冊 IMongoDatabase
            services.AddSingleton(provider =>
            {
                var client = provider.GetRequiredService<IMongoClient>();
                return client.GetDatabase(databaseName);
            });

            // 註冊 IMongoCollection<CacheEntry>
            services.AddSingleton(provider =>
            {
                var database = provider.GetRequiredService<IMongoDatabase>();
                return database.GetCollection<CacheEntry>(collectionName);
            });

            // 註冊自訂的 IDistributedCache 實作
            services.AddSingleton<IDistributedCache, MongoDBDistributedCache>();

            return services;
        }
    }
}
```
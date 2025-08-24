import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

interface CachedPricingData {
  timestamp: number;
  data: any;
  version: string;
}

export class PricingCache {
  private static readonly CACHE_DIR = path.join(process.env.HOME || '', '.aitools');
  private static readonly CACHE_FILE = path.join(PricingCache.CACHE_DIR, 'model_pricing.json');
  private static readonly LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor() {
    this.ensureCacheDirectory();
  }

  /**
   * 確保快取目錄存在
   */
  private ensureCacheDirectory(): void {
    if (!fs.existsSync(PricingCache.CACHE_DIR)) {
      fs.mkdirSync(PricingCache.CACHE_DIR, { recursive: true });
    }
  }

  /**
   * 檢查快取是否存在且未過期
   */
  private isCacheValid(): boolean {
    try {
      if (!fs.existsSync(PricingCache.CACHE_FILE)) {
        return false;
      }

      const cachedData: CachedPricingData = JSON.parse(
        fs.readFileSync(PricingCache.CACHE_FILE, 'utf8')
      );

      const now = Date.now();
      const cacheAge = now - cachedData.timestamp;
      
      return cacheAge < PricingCache.CACHE_DURATION;
    } catch (error) {
      // 快取檔案損壞，視為無效
      return false;
    }
  }

  /**
   * 從快取讀取價格資料
   */
  private readFromCache(): any | null {
    try {
      if (!fs.existsSync(PricingCache.CACHE_FILE)) {
        return null;
      }

      const cachedData: CachedPricingData = JSON.parse(
        fs.readFileSync(PricingCache.CACHE_FILE, 'utf8')
      );

      return cachedData.data;
    } catch (error) {
      console.warn('Failed to read pricing cache:', error);
      return null;
    }
  }

  /**
   * 將價格資料寫入快取
   */
  private writeToCache(data: any): void {
    try {
      const cachedData: CachedPricingData = {
        timestamp: Date.now(),
        data: data,
        version: '1.0'
      };

      fs.writeFileSync(
        PricingCache.CACHE_FILE, 
        JSON.stringify(cachedData, null, 2), 
        'utf8'
      );
    } catch (error) {
      console.warn('Failed to write pricing cache:', error);
    }
  }

  /**
   * 從 LiteLLM API 獲取最新價格資料
   */
  private fetchFromAPI(): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = https.get(PricingCache.LITELLM_URL, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const pricingData = JSON.parse(data);
            resolve(pricingData);
          } catch (error) {
            reject(new Error(`Failed to parse pricing data: ${error}`));
          }
        });
      });

      request.on('error', (error) => {
        reject(new Error(`Network request failed: ${error.message}`));
      });

      // 10秒逾時
      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * 獲取價格資料（優先快取，過期則更新）
   */
  async getPricingData(): Promise<any> {
    // 檢查快取是否有效
    if (this.isCacheValid()) {
      const cachedData = this.readFromCache();
      if (cachedData) {
        return cachedData;
      }
    }

    // 快取無效或不存在，嘗試從 API 獲取
    try {
      const freshData = await this.fetchFromAPI();
      this.writeToCache(freshData);
      return freshData;
    } catch (error) {
      console.warn('Failed to fetch fresh pricing data:', error);
      
      // 如果 API 失敗，嘗試使用過期的快取
      const staleCache = this.readFromCache();
      if (staleCache) {
        console.warn('Using stale cached pricing data');
        return staleCache;
      }
      
      // 完全失敗，拋出錯誤
      throw new Error('No pricing data available (API failed and no cache)');
    }
  }

  /**
   * 強制重新整理快取
   */
  async refreshCache(): Promise<void> {
    try {
      const freshData = await this.fetchFromAPI();
      this.writeToCache(freshData);
      console.log('Pricing cache refreshed successfully');
    } catch (error) {
      throw new Error(`Failed to refresh pricing cache: ${error}`);
    }
  }

  /**
   * 清除快取
   */
  clearCache(): void {
    try {
      if (fs.existsSync(PricingCache.CACHE_FILE)) {
        fs.unlinkSync(PricingCache.CACHE_FILE);
        console.log('Pricing cache cleared');
      }
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }

  /**
   * 取得快取資訊
   */
  getCacheInfo(): { exists: boolean; age?: string; size?: string } {
    try {
      if (!fs.existsSync(PricingCache.CACHE_FILE)) {
        return { exists: false };
      }

      const stats = fs.statSync(PricingCache.CACHE_FILE);
      const cachedData: CachedPricingData = JSON.parse(
        fs.readFileSync(PricingCache.CACHE_FILE, 'utf8')
      );

      const ageMs = Date.now() - cachedData.timestamp;
      const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
      const ageMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));

      return {
        exists: true,
        age: `${ageHours}h ${ageMinutes}m`,
        size: `${Math.round(stats.size / 1024)}KB`
      };
    } catch (error) {
      return { exists: false };
    }
  }
}
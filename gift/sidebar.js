// *** 導覽列內容字串 ***
        const sidebarHtmlContent = `
            <h3 class="text-2xl font-bold text-indigo-700 mb-6">簡報目錄</h3>
            <ul id="nav-list">
                <li><a href="slide_01.html" class="nav-item">封面:AI禮品客製化平台</a></li>
                <li><a href="slide_02.html" class="nav-item">系統規劃:禮品客製化平台</a></li>
                <li><a href="slide_03.html" class="nav-item">AI推薦流程:1-客戶發起需求</a></li>
                <li><a href="slide_04.html" class="nav-item">AI推薦流程:2-取得媒合清單</a></li>
                <li><a href="slide_05.html" class="nav-item">AI推薦流程:3-禮品打樣</a></li>
                <li><a href="slide_06.html" class="nav-item">後台管理系統</a></li>
                <li><a href="slide_07.html" class="nav-item">AI提案簡報: 需求清單</a></li>
                <li><a href="slide_08.html" class="nav-item">AI提案簡報: 生成簡報</a></li>
                <li><a href="slide_09.html" class="nav-item">AI產品上架文案輔助生成文案</a></li>
                <li><a href="slide_10.html" class="nav-item">自動產品分類與媒合</a></li>
                <li><a href="slide_11.html" class="nav-item">成本預估</a></li>
                <li><a href="slide_12.html" class="nav-item">WBS 開發工項</a></li>
                <li><a href="slide_13.html" class="nav-item">END</a></li>
            </ul>
        `;

        // *** 導覽列載入與啟動邏輯 ***
        document.addEventListener('DOMContentLoaded', () => {
            const sidebarPlaceholder = document.getElementById('sidebar-placeholder');
            const path = window.location.pathname;
            // 取得當前檔案名稱，例如 'slide_01.html'
            const currentFile = path.substring(path.lastIndexOf('/') + 1);
            
            // 1. 注入導覽列內容
            sidebarPlaceholder.innerHTML = sidebarHtmlContent;

            // 2. 標記當前投影片為 active
            const navItems = document.querySelectorAll('#nav-list a');
            navItems.forEach(item => {
                const href = item.getAttribute('href');
                if (href === currentFile) {
                    item.classList.add('active');
                    // 確保 active 項目在側邊欄內可見
                    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });

            // 3. (僅針對 slide_09.html) 啟用 Lightbox 功能
            if (currentFile === 'slide_09.html') {
                const hofontBox = document.getElementById('hofontsvgbx');
                const hocmsBox = document.getElementById('hocmssvgbx');
                const closeHofontBtn = document.getElementById('close-hofont');
                const closeHocmsBtn = document.getElementById('close-hocms');

                if (hofontBox && hocmsBox) {
                    hofontBox.classList.add('cursor-zoom-in', 'transition', 'duration-300', 'hover:scale-105');
                    hocmsBox.classList.add('cursor-zoom-in', 'transition', 'duration-300', 'hover:scale-105');

                    // 開啟 Lightbox
                    hofontBox.addEventListener('click', function() { this.classList.add('lightbox-active'); });
                    hocmsBox.addEventListener('click', function() { this.classList.add('lightbox-active'); });

                    // 關閉 Lightbox (需要阻止事件冒泡，防止點擊關閉鈕又觸發開啟)
                    closeHofontBtn.addEventListener('click', function(event) { event.stopPropagation(); hofontBox.classList.remove('lightbox-active'); });
                    closeHocmsBtn.addEventListener('click', function(event) { event.stopPropagation(); hocmsBox.classList.remove('lightbox-active'); });
                }
            }
        });
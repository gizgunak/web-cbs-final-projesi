// ============================================================================
// 1) SUPABASE BAĞLANTI AYARLARI  —  BURAYI MUTLAKA DOLDURUN
// ============================================================================
// Nereden bulunur:
//   1. https://supabase.com adresinden projenize giriş yapın
//   2. Sol menüden "Project Settings" (dişli ikonu) > "API" sekmesine gidin
//   3. "Project URL" yazan kutudaki adresi kopyalayıp SUPABASE_URL'e yapıştırın
//      (örn: https://abcdefghij.supabase.co)
//   4. "Project API keys" bölümündeki "anon" / "public" anahtarını kopyalayıp
//      SUPABASE_ANON_KEY'e yapıştırın
//
//   ÖNEMLİ: Buraya ASLA "service_role" anahtarını yapıştırmayın!
//   "anon public" anahtarı, tarayıcıda (herkesin görebileceği bir yerde)
//   kullanılmak üzere tasarlanmıştır ve güvenlidir; service_role ise
//   veritabanınıza tam yetkiyle erişim sağlar ve GİZLİ tutulmalıdır.
// ============================================================================
const SUPABASE_URL = 'https://uijhphccjchxofyftcii.supabase.co';        // örn: 'https://abcdefghij.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_iZY7BMN5dbRo4p3EGYo1fg_IolsSjsq';

// supabase-js kütüphanesini CDN üzerinden ES module olarak import ediyoruz.
// npm install YOK, build aracı YOK — tarayıcı bu satırı doğrudan internetten indirir.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================================
// 2) VERİTABANI KOLON ADI AYARLARI
// ============================================================================
// Supabase fonksiyonlarınızın döndürdüğü GeoJSON'daki "properties" içinde
// hangi alan adları geçiyorsa (il adı, il kodu/plaka no, ilçe adı vb.)
// onları AŞAĞIDA gerçek isimleriyle güncelleyin. Kod, sadece bu isimleri
// kullanarak çalışıyor; başka hiçbir yeri değiştirmenize gerek yok.
//
// Kontrol etmek için: Supabase'de SQL Editor'e girip
//   select get_tr_iller_geojson();
// yazıp çalıştırın, dönen JSON'un "properties" kısmındaki alan adlarına bakın.
// ============================================================================
const FIELD = {
  ilAdi: 'name_1',        // il tablosunda ilin adını tutan kolon (GADM: name_1)
  ilKodu: 'gid_1',        // il tablosunda ilin benzersiz GADM kimliği (GADM: gid_1)
  ilceAdi: 'name_2',      // ilçe tablosunda ilçenin adını tutan kolon (GADM: name_2)
  ilceIlKodu: 'gid_1'     // ilçe tablosunda, ilçenin HANGİ İLE ait olduğunu gösteren kolon
                            // (GADM'de ilçe tablosu da üst ilin gid_1 değerini taşır)
};

// Supabase'deki RPC (fonksiyon) isimleri
const RPC_ILLER = 'get_tr_iller_geojson';
const RPC_ILCELER = 'get_tr_ilceler_geojson';

// ============================================================================
// 3) YARDIMCI FONKSİYONLAR (Yükleniyor göstergesi)
// ============================================================================
const loadingEl = document.getElementById('loading');
function yuklemeGoster() {
  loadingEl.classList.remove('hidden');
}
function yuklemeGizle() {
  loadingEl.classList.add('hidden');
}

// ============================================================================
// 4) HARİTA KURULUMU
// ============================================================================
// Taban harita (basemap) seçenekleri: hepsi açık kaynak / ücretsiz, API
// anahtarı gerektirmez. Açık ve Koyu temalar CARTO'nun (basemaps.cartocdn.com)
// herkese açık, PNG dışa aktarma ile uyumlu (CORS izinli) karo sunucusundan
// geliyor. Her sağlayıcının kullanım şartları gereği "attributions" (atıf)
// metnini haritanın sağ alt köşesinde otomatik gösteriyoruz; kaldırmayın.
const osmLayer = new ol.layer.Tile({
  source: new ol.source.OSM(),
  visible: true // sayfa açıldığında görünen varsayılan tema
});

const cartoLightLayer = new ol.layer.Tile({
  source: new ol.source.XYZ({
    url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attributions: '© OpenStreetMap katkıda bulunanları © CARTO',
    crossOrigin: 'anonymous', // PNG olarak dışa aktarma özelliğinin çalışabilmesi için gerekli
    maxZoom: 20
  }),
  visible: false
});

const cartoDarkLayer = new ol.layer.Tile({
  source: new ol.source.XYZ({
    url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attributions: '© OpenStreetMap katkıda bulunanları © CARTO',
    crossOrigin: 'anonymous',
    maxZoom: 20
  }),
  visible: false
});

// "Harita Teması" seçim menüsündeki <option value="..."> değerleriyle
// yukarıdaki katmanları eşleştiren sözlük — basemapSelect olayında kullanılıyor
const basemapLayers = {
  osm: osmLayer,
  cartoLight: cartoLightLayer,
  cartoDark: cartoDarkLayer
};

// GeoJSON okumak/yazmak için OpenLayers formatı
const geoJsonFormat = new ol.format.GeoJSON();

// İl sınırlarını tutan katman
const illerSource = new ol.source.Vector();
const illerLayer = new ol.layer.Vector({
  source: illerSource,
  style: new ol.style.Style({
    stroke: new ol.style.Stroke({ color: '#1d4ed8', width: 2 }),
    fill: new ol.style.Fill({ color: 'rgba(29, 78, 216, 0.05)' })
  })
});

// Seçili ilin ilçelerini tutan katman (başlangıçta boş)
const ilceSource = new ol.source.Vector();
const ilceLayer = new ol.layer.Vector({
  source: ilceSource,
  style: new ol.style.Style({
    stroke: new ol.style.Stroke({ color: '#dc2626', width: 1.5, lineDash: [4, 4] }),
    fill: new ol.style.Fill({ color: 'rgba(220, 38, 38, 0.08)' })
  })
});

const map = new ol.Map({
  target: 'map',
  // Katman sırası önemli: OpenLayers listede önce gelen katmanı en ALTA çizer.
  // Bu yüzden taban harita katmanları en altta (aynı anda sadece biri "visible"),
  // il/ilçe sınırları onların üstünde.
  layers: [osmLayer, cartoLightLayer, cartoDarkLayer, illerLayer, ilceLayer],
  view: new ol.View({
    center: ol.proj.fromLonLat([35.0, 39.0]), // Türkiye'nin ortalaması
    zoom: 6
  })
});

// ----------------------------------------------------------------------------
// Fare ile üzerine gelinen il/ilçe adını gösteren tooltip
// ----------------------------------------------------------------------------
const tooltipElement = document.getElementById('tooltip');
const tooltipOverlay = new ol.Overlay({
  element: tooltipElement,
  offset: [0, -12],       // balonu imlecin biraz üstünde göster
  positioning: 'bottom-center'
});
map.addOverlay(tooltipOverlay);

map.on('pointermove', (evt) => {
  // Harita sürükleniyorsa (kullanıcı haritayı kaydırıyorsa) tooltip'i gösterme
  if (evt.dragging) {
    tooltipOverlay.setPosition(undefined);
    return;
  }

  // İmlecin altındaki EN ÜSTTEKİ feature'ı bul (ilçe katmanı üstte olduğu için
  // ilçeler görünürken önce onlar, değilse iller yakalanır)
  const feature = map.forEachFeatureAtPixel(evt.pixel, (feat) => feat);

  if (feature) {
    // Önce ilçe adını dene, yoksa il adını göster
    const ad = feature.get(FIELD.ilceAdi) || feature.get(FIELD.ilAdi) || '';
    tooltipElement.textContent = ad;
    tooltipOverlay.setPosition(evt.coordinate);
    map.getViewport().style.cursor = 'pointer';
  } else {
    tooltipOverlay.setPosition(undefined);
    map.getViewport().style.cursor = '';
  }
});

// Seçilen değere göre ilgili OpenLayers feature'ına hızlı erişim için sözlükler
const ilFeaturesByKod = {};   // { plakaKodu: ol.Feature }
let tumIlceFeatures = [];     // tüm ilçelerin tamamı (client tarafında filtrelemek için)

// ============================================================================
// 5) İLLERİ SUPABASE'DEN ÇEKME
// ============================================================================
async function illeriYukle() {
  try {
    // ÖNEMLİ: Geometri veritabanında WKB formatında saklandığı için
    // .from('iller').select() ile DOĞRUDAN tabloyu çekmiyoruz — OpenLayers
    // WKB'yi okuyamaz. Bunun yerine, geometriyi sunucu tarafında GeoJSON'a
    // çeviren hazır bir RPC fonksiyonunu çağırıyoruz.
    const { data, error } = await supabase.rpc(RPC_ILLER);

    if (error) {
      console.error('❌ İller çekilirken Supabase hatası:', error.message);
      alert('İller yüklenemedi. Ayrıntı için tarayıcı konsoluna (F12) bakın.');
      return;
    }

    if (!data || !data.features || data.features.length === 0) {
      console.warn('⚠️ İller verisi boş geldi. Supabase\'de RLS (Row Level Security) '
        + 'policy ayarlarını kontrol edin — "anon" rolüne SELECT/EXECUTE izni '
        + 'verilmemiş olabilir.');
      return;
    }

    // Gelen GeoJSON EPSG:4326'da; haritamız EPSG:3857 kullanıyor.
    // dataProjection: verinin geldiği projeksiyon
    // featureProjection: haritada gösterilecek projeksiyon
    const features = geoJsonFormat.readFeatures(data, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    });

    illerSource.addFeatures(features);

    // Açılır menüyü doldur
    const ilSelect = document.getElementById('ilSelect');
    features
      .slice()
      .sort((a, b) => String(a.get(FIELD.ilAdi)).localeCompare(String(b.get(FIELD.ilAdi)), 'tr'))
      .forEach((feature) => {
        const kod = feature.get(FIELD.ilKodu);
        const ad = feature.get(FIELD.ilAdi);
        ilFeaturesByKod[kod] = feature;

        const option = document.createElement('option');
        option.value = kod;
        option.textContent = ad;
        ilSelect.appendChild(option);
      });

  } catch (err) {
    // Ağ hatası, JSON parse hatası vb. beklenmedik durumlar
    console.error('❌ İller yüklenirken beklenmeyen bir hata oluştu:', err);
    alert('İller yüklenemedi (beklenmeyen hata). Ayrıntı için konsola (F12) bakın.');
  }
}

// ============================================================================
// 6) İLÇELERİ SUPABASE'DEN ÇEKME (bir kez, tamamı)
// ============================================================================
// Tüm ilçeleri baştan çekip haritaya EKLEMİYORUZ; sadece hafızada tutuyoruz.
// Kullanıcı bir il seçtiğinde, o ile ait olanları filtreleyip haritaya
// ve ilçe menüsüne o zaman ekliyoruz (cascading dropdown mantığı).
async function ilceleriYukle() {
  try {
    const { data, error } = await supabase.rpc(RPC_ILCELER);

    if (error) {
      console.error('❌ İlçeler çekilirken Supabase hatası:', error.message);
      alert('İlçeler yüklenemedi. Ayrıntı için tarayıcı konsoluna (F12) bakın.');
      return;
    }

    if (!data || !data.features || data.features.length === 0) {
      console.warn('⚠️ İlçeler verisi boş geldi. Supabase\'de RLS (Row Level Security) '
        + 'policy ayarlarını kontrol edin — "anon" rolüne SELECT/EXECUTE izni '
        + 'verilmemiş olabilir.');
      return;
    }

    tumIlceFeatures = geoJsonFormat.readFeatures(data, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    });

  } catch (err) {
    console.error('❌ İlçeler yüklenirken beklenmeyen bir hata oluştu:', err);
    alert('İlçeler yüklenemedi (beklenmeyen hata). Ayrıntı için konsola (F12) bakın.');
  }
}

// ============================================================================
// 7) İL SEÇİLİNCE: haritayı zoom'la, ilçe menüsünü doldur
// ============================================================================
const ilSelect = document.getElementById('ilSelect');
const ilceSelect = document.getElementById('ilceSelect');

ilSelect.addEventListener('change', () => {
  const secilenKod = ilSelect.value;

  // İlçe katmanını ve menüsünü sıfırla
  ilceSource.clear();
  ilceSelect.innerHTML = '<option value="">-- İlçe Seçin --</option>';

  if (!secilenKod) {
    ilceSelect.disabled = true;
    ilceSelect.innerHTML = '<option value="">-- Önce İl Seçin --</option>';
    return;
  }

  const ilFeature = ilFeaturesByKod[secilenKod];
  if (!ilFeature) {
    console.warn('⚠️ Seçilen il için harita üzerinde eşleşen bir geometri bulunamadı.');
    return;
  }

  // Haritayı ilin sınırlarına zoom'la
  map.getView().fit(ilFeature.getGeometry().getExtent(), {
    padding: [40, 40, 40, 40],
    duration: 500
  });

  // Sadece bu ile ait ilçeleri filtrele
  const ileAitIlceler = tumIlceFeatures.filter(
    (f) => String(f.get(FIELD.ilceIlKodu)) === String(secilenKod)
  );

  if (ileAitIlceler.length === 0) {
    console.warn(`⚠️ "${secilenKod}" koduna sahip il için ilçe bulunamadı. `
      + 'FIELD.ilceIlKodu ayarının doğru kolonu gösterdiğinden emin olun.');
  }

  ilceSource.addFeatures(ileAitIlceler);

  ileAitIlceler
    .slice()
    .sort((a, b) => String(a.get(FIELD.ilceAdi)).localeCompare(String(b.get(FIELD.ilceAdi)), 'tr'))
    .forEach((feature, index) => {
      const option = document.createElement('option');
      // Benzersiz bir değer olması için index kullanıyoruz;
      // feature'ın kendisine bu index üzerinden erişeceğiz.
      option.value = String(index);
      option.textContent = feature.get(FIELD.ilceAdi);
      ilceSelect.appendChild(option);
    });

  // Sıralamayı option'lara uyguladığımız için, feature dizisini de
  // aynı sırayla tutup ilceSelect ile eşleştiriyoruz:
  ilceSelect._siraliFeatureler = ileAitIlceler
    .slice()
    .sort((a, b) => String(a.get(FIELD.ilceAdi)).localeCompare(String(b.get(FIELD.ilceAdi)), 'tr'));

  ilceSelect.disabled = false;
});

// ============================================================================
// 8) İLÇE SEÇİLİNCE: haritayı o ilçeye zoom'la
// ============================================================================
ilceSelect.addEventListener('change', () => {
  const index = ilceSelect.value;
  if (index === '') return;

  const feature = ilceSelect._siraliFeatureler?.[Number(index)];
  if (!feature) return;

  map.getView().fit(feature.getGeometry().getExtent(), {
    padding: [60, 60, 60, 60],
    duration: 500
  });
});

// ============================================================================
// 9) HARİTA TEMASI SEÇİLİNCE: seçilen taban haritayı göster, diğerlerini gizle
// ============================================================================
const basemapSelect = document.getElementById('basemapSelect');
basemapSelect.addEventListener('change', () => {
  const secilenTema = basemapSelect.value;
  Object.entries(basemapLayers).forEach(([anahtar, katman]) => {
    katman.setVisible(anahtar === secilenTema);
  });
});

// ============================================================================
// 10) GÖRÜNEN HARİTAYI PNG OLARAK İNDİRME
// ============================================================================
// OpenLayers, haritayı katman katman ayrı <canvas> elemanlarına çiziyor.
// PNG oluşturmak için: taban harita + il/ilçe katmanlarının tamamını tek bir
// geçici canvas üzerinde birleştirip, o birleşik görüntüyü dosya olarak indiriyoruz.
document.getElementById('exportButton').addEventListener('click', () => {
  // rendercomplete: haritanın o an ekranda görünen tüm karolarının/çizimlerinin
  // tamamlandığı an — PNG'yi bu olaydan SONRA oluşturuyoruz ki eksik/boş görünmesin.
  map.once('rendercomplete', () => {
    try {
      const mapCanvas = document.createElement('canvas');
      const mapSize = map.getSize();
      mapCanvas.width = mapSize[0];
      mapCanvas.height = mapSize[1];
      const mapContext = mapCanvas.getContext('2d');

      // Haritadaki her bir katmanın canvas'ını sırayla büyük canvas'ın üzerine çiz
      Array.prototype.forEach.call(
        map.getViewport().querySelectorAll('.ol-layer canvas, canvas.ol-layer'),
        (canvas) => {
          if (canvas.width === 0) return; // görünmeyen (visible:false) katmanları atla

          const katmanOpacity = canvas.parentNode.style.opacity || canvas.style.opacity;
          mapContext.globalAlpha = katmanOpacity === '' ? 1 : Number(katmanOpacity);

          // Katmanın ekran üzerindeki konum/dönüşüm bilgisini (transform matrisini) al
          const transform = canvas.style.transform;
          const matrix = transform
            .match(/^matrix\(([^\(]*)\)$/)[1]
            .split(',')
            .map(Number);
          CanvasRenderingContext2D.prototype.setTransform.apply(mapContext, matrix);
          mapContext.drawImage(canvas, 0, 0);
        }
      );

      mapContext.globalAlpha = 1;

      // Birleşik canvas'ı PNG dosyasına çevirip otomatik indirmeyi başlat
      mapCanvas.toBlob((blob) => {
        if (!blob) {
          console.error('❌ PNG oluşturulamadı (blob boş döndü).');
          alert('Harita PNG olarak oluşturulamadı. Konsolu (F12) kontrol edin.');
          return;
        }
        const tarih = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const link = document.createElement('a');
        link.download = `harita-${tarih}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      });

    } catch (err) {
      // En sık karşılaşılan sebep: taban harita sağlayıcısının (CartoDB/OpenTopoMap)
      // sunucusu CORS izni vermiyor ve canvas "kirlenmiş" (tainted) hale geliyor.
      console.error('❌ Harita PNG olarak dışa aktarılamadı:', err);
      alert('Harita PNG olarak indirilemedi. Bu genelde seçili harita temasının '
        + 'sunucusundan kaynaklanan bir izin (CORS) sorunudur — farklı bir tema '
        + 'seçip tekrar deneyin. Ayrıntı için konsola (F12) bakın.');
    }
  });

  // Yukarıdaki 'rendercomplete' dinleyicisini tetiklemek için haritayı yeniden çizdiriyoruz
  map.renderSync();
});

// ============================================================================
// 11) BAŞLANGIÇ: sayfa açılır açılmaz illeri ve ilçeleri yükle
// ============================================================================
async function baslat() {
  yuklemeGoster();
  // İkisini aynı anda (paralel) çekiyoruz ki bekleme süresi kısalsın
  await Promise.all([illeriYukle(), ilceleriYukle()]);
  yuklemeGizle();
}

baslat();
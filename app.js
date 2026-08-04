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
  ilAdi: 'name_1',        // il tablosunda ilin adını tutan kolon
  ilKodu: 'gid_1',   // il tablosunda ilin benzersiz kodunu tutan kolon (örn. plaka no)
  ilceAdi: 'name_2',    // ilçe tablosunda ilçenin adını tutan kolon
  ilceIlKodu: 'gid_1' // ilçe tablosunda, ilçenin HANGİ İLE ait olduğunu gösteren kolon
                            // (yukarıdaki ilKodu ile aynı değerleri taşımalı ki eşleştirme yapılabilsin)
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
  layers: [illerLayer, ilceLayer],
  view: new ol.View({
    center: ol.proj.fromLonLat([35.0, 39.0]), // Türkiye'nin ortalaması
    zoom: 6
  })
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
// 9) BAŞLANGIÇ: sayfa açılır açılmaz illeri ve ilçeleri yükle
// ============================================================================
async function baslat() {
  yuklemeGoster();
  // İkisini aynı anda (paralel) çekiyoruz ki bekleme süresi kısalsın
  await Promise.all([illeriYukle(), ilceleriYukle()]);
  yuklemeGizle();
}

baslat();

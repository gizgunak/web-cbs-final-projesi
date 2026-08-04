// 1. SUPABASE BAĞLANTI AYARLARI
// Supabase panelinizden aldığınız URL ve Anon Key bilgilerini buraya yapıştırın.
import { createClient } from 'https://jsdelivr.net';

const SUPABASE_URL = "https://uijhphccjchxofyftcii.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_iZY7BMN5dbRo4p3EGYo1fg_IolsSjsq";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. HTML ELEMENTLERİNİ TANIMLAMA
const ilSelect = document.getElementById('il-seciniz');
const ilceSelect = document.getElementById('ilce-seciniz');
const yukleniyorYazisi = document.getElementById('yukleniyor-text');

// 3. OPENLAYERS HARİTA KATMANLARI VE KURULUMU
// Altlık Harita (OpenStreetMap)
const altlikKatmani = new ol.layer.Tile({
    source: new ol.source.OSM()
});

// İller için boş bir CBS veri kaynağı ve katmanı oluşturuyoruz
const ilKaynak = new ol.source.Vector();
const ilKatmani = new ol.layer.Vector({
    source: ilKaynak,
    style: new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: '#3f51b5',
            width: 2
        }),
        fill: new ol.style.Fill({
            color: 'rgba(63, 81, 181, 0.1)'
        })
    })
});

// İlçeler için boş bir CBS veri kaynağı ve katmanı oluşturuyoruz
const ilceKaynak = new ol.source.Vector();
const ilceKatmani = new ol.layer.Vector({
    source: ilceKaynak,
    style: new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: '#ff5722',
            width: 1.5,
            lineDash: [4, 4] // Kesikli çizgi tasarımı
        }),
        fill: new ol.style.Fill({
            color: 'rgba(255, 87, 34, 0.05)'
        })
    })
});

// Haritayı başlatıyoruz (İlk başta Türkiye merkezli)
const haritaGorunumu = new ol.View({
    center: ol.proj.fromLonLat([35.2433, 38.9637]), // Türkiye Coğrafi Merkezi
    zoom: 6
});

const map = new ol.Map({
    target: 'map',
    layers: [altlikKatmani, ilKatmani, ilceKatmani],
    view: haritaGorunumu
});

// GeoJSON format okuyucu (EPSG:4326 verisini haritanın EPSG:3857 sistemine çevirecek)
const geojsonOkuyucu = new ol.format.GeoJSON({
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
});

// 4. VERİ ÇEKME VE FONKSİYONLAR

// Yükleniyor durumunu kontrol eden fonksiyon
function durumGuncelle(mesaj, gorunurMu = true) {
    if (gorunurMu) {
        yukleniyorYazisi.style.display = "block";
        yukleniyorYazisi.innerText = mesaj;
    } else {
        yukleniyorYazisi.style.display = "none";
    }
}

// Uygulama başladığında İlleri Supabase'den çeken fonksiyon
async function illeriYukle() {
    try {
        durumGuncelle("İller veritabanından çekiliyor...");
        
        // Supabase RPC fonksiyonunuzu çağırıyoruz
        const { data, error } = await supabase.rpc('get_tr_iller_geojson');

        if (error) throw error;

        // Veri boş geldiyse RLS uyarısı ver
        if (!data || !data.features || data.features.length === 0) {
            durumGuncelle("RLS policy kontrol edin", true);
            console.warn("Veri boş döndü. Lütfen Supabase RLS (Row Level Security) politikalarını kontrol edin!");
            ilSelect.innerHTML = '<option value="">Erişim Engellendi</option>';
            return;
        }

        // Gelen GeoJSON'u OpenLayers formatına çevirip harita kaynağına ekle
        const iller = geojsonOkuyucu.readFeatures(data);
        ilKaynak.clear();
        ilKaynak.addFeatures(iller);

        // İl seçim menüsünü (Dropdown) doldur
        ilSelect.innerHTML = '<option value="">-- İl Seçiniz --</option>';
        iller.forEach(il => {
            const ad = il.get('il_adi') || il.get('name') || "Bilinmeyen İl"; 
            const id = il.get('il_kodu') || il.get('id'); // Veritabanındaki kolon adınıza göre eşleşir
            
            const option = document.createElement('option');
            option.value = id;
            option.textContent = ad;
            ilSelect.appendChild(option);
        });

        durumGuncelle("", false); // Yükleme bitti, yazıyı gizle

    } catch (err) {
        durumGuncelle("İl verileri yüklenirken hata oluştu!", true);
        console.error("Supabase İl Çekme Hatası:", err.message);
    }
}

// Bir il seçildiğinde o ile ait ilçeleri Supabase'den çeken fonksiyon
async function ilceleriYukle(ilKodu) {
    try {
        durumGuncelle("İlçeler çekiliyor...");
        ilceKaynak.clear(); // Eski ilçeleri haritadan temizle
        
        ilceSelect.innerHTML = '<option value="">Yükleniyor...</option>';
        ilceSelect.disabled = true;

        // Supabase RPC fonksiyonuna seçilen ilin kodunu parametre olarak gönderiyoruz
        // Not: Sol taraftaki 'p_il_kodu' parametre ismini Postgresql fonksiyonunuzdaki girdi parametre ismiyle birebir aynı yapın
        const { data, error } = await supabase.rpc('get_tr_ilceler_geojson', { gid_1: ilKodu });

        if (error) throw error;

        if (!data || !data.features || data.features.length === 0) {
            durumGuncelle("RLS policy kontrol edin", true);
            console.warn("İlçe verisi boş döndü. Lütfen Supabase RLS politikalarını kontrol edin!");
            ilceSelect.innerHTML = '<option value="">Veri Bulunamadı</option>';
            return;
        }

        // İlçeleri haritaya ekle
        const ilceler = geojsonOkuyucu.readFeatures(data);
        ilceKaynak.addFeatures(ilceler);

        // İlçe seçim menüsünü doldur
        ilceSelect.innerHTML = '<option value="">-- İlçe Seçiniz --</option>';
        ilceler.forEach(ilce => {
            const ad = ilce.get('ilce_adi') || ilce.get('name') || "Bilinmeyen İlçe";
            const id = ilce.get('ilce_kodu') || ilce.get('id');

            const option = document.createElement('option');
            option.value = id;
            option.textContent = ad;
            ilceSelect.appendChild(option);
        });

        ilceSelect.disabled = false;
        durumGuncelle("", false);

    } catch (err) {
        durumGuncelle("İlçe verileri yüklenirken hata oluştu!", true);
        console.error("Supabase İlçe Çekme Hatası:", err.message);
    }
}

// 5. ETKİLEŞİM VE OLAY İZLEYİCİLERİ (EVENT LISTENERS)

// İl açılır menüsü değiştiğinde çalışacak kod:
ilSelect.addEventListener('change', (e) => {
    const secilenIlKodu = e.target.value;

    if (!secilenIlKodu) {
        // Eğer seçimi temizlediyse ilçeleri kapat ve Türkiye geneline dön
        ilceSelect.innerHTML = '<option value="">Önce İl Seçiniz</option>';
        ilceSelect.disabled = true;
        ilceKaynak.clear();
        haritaGorunumu.animate({ center: ol.proj.fromLonLat([35.2433, 38.9637]), zoom: 6 });
        return;
    }

    // Haritada seçilen ile zoom yap (Fit işlemi)
    const secilenIlFeature = ilKaynak.getFeatures().find(f => (f.get('il_kodu') || f.get('id')) == secilenIlKodu);
    if (secilenIlFeature) {
        const geometri = secilenIlFeature.getGeometry();
        haritaGorunumu.fit(geometri, { padding:, duration: 1000 });
    }

    // İlçeleri veritabanından getir
    ilceleriYukle(secilenIlKodu);
});

// İlçe açılır menüsü değiştiğinde çalışacak kod:
ilceSelect.addEventListener('change', (e) => {
    const secilenIlceKodu = e.target.value;
    if (!secilenIlceKodu) return;

    // Haritada seçilen ilçeyi bul ve zoom yap
    const secilenIlceFeature = ilceKaynak.getFeatures().find(f => (f.get('ilce_kodu') || f.get('id')) == secilenIlceKodu);
    if (secilenIlceFeature) {
        const geometri = secilenIlceFeature.getGeometry();
        haritaGorunumu.fit(geometri, { padding:, duration: 1000 });
    }
});

// Sayfa ilk açıldığında illeri yükleyerek sistemi başlat
illeriYukle();

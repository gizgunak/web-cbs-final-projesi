// 1. SUPABASE BAĞLANTI AYARLARI
const SUPABASE_URL = "https://uijhphccjchxofyftcii.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_iZY7BMN5dbRo4p3EGYo1fg_IolsSjsq";

// index.html içinde yüklediğimiz global Supabase nesnesini kullanıyoruz
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. HTML ELEMENTLERİNİ TANIMLAMA
const ilSelect = document.getElementById('il-seciniz');
const ilceSelect = document.getElementById('ilce-seciniz');
const yukleniyorYazisi = document.getElementById('yukleniyor-text');

// 3. OPENLAYERS HARİTA KATMANLARI VE KURULUMU
const altlikKatmani = new ol.layer.Tile({
    source: new ol.source.OSM()
});

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

const ilceKaynak = new ol.source.Vector();
const ilceKatmani = new ol.layer.Vector({
    source: ilceKaynak,
    style: new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: '#ff5722',
            width: 1.5,
            lineDash: [4, 4]
        }),
        fill: new ol.style.Fill({
            color: 'rgba(255, 87, 34, 0.05)'
        })
    })
});

const haritaGorunumu = new ol.View({
    center: ol.proj.fromLonLat([35.2433, 38.9637]), 
    zoom: 6
});

const map = new ol.Map({
    target: 'map',
    layers: [altlikKatmani, ilKatmani, ilceKatmani],
    view: haritaGorunumu
});

const geojsonOkuyucu = new ol.format.GeoJSON({
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
});

// 4. VERİ ÇEKME VE FONKSİYONLAR
function durumGuncelle(mesaj, gorunurMu = true) {
    if (gorunurMu) {
        yukleniyorYazisi.style.display = "block";
        yukleniyorYazisi.innerText = mesaj;
    } else {
        yukleniyorYazisi.style.display = "none";
    }
}

async function illeriYukle() {
    try {
        durumGuncelle("İller veritabanından çekiliyor...");
        
        const { data, error } = await supabase.rpc('get_tr_iller_geojson');

        if (error) throw error;

        if (!data || !data.features || data.features.length === 0) {
            durumGuncelle("RLS policy kontrol edin", true);
            console.warn("Veri boş döndü. Lütfen Supabase RLS politikalarını kontrol edin!");
            ilSelect.innerHTML = '<option value="">Erişim Engellendi</option>';
            return;
        }

        const iller = geojsonOkuyucu.readFeatures(data);
        ilKaynak.clear();
        ilKaynak.addFeatures(iller);

        ilSelect.innerHTML = '<option value="">-- İl Seçiniz --</option>';
        iller.forEach(il => {
            const ad = il.get('il_adi') || il.get('name') || "Bilinmeyen İl"; 
            const id = il.get('il_kodu') || il.get('id');
            
            const option = document.createElement('option');
            option.value = id;
            option.textContent = ad;
            ilSelect.appendChild(option);
        });

        durumGuncelle("", false);

    } catch (err) {
        durumGuncelle("İl verileri yüklenirken hata oluştu!", true);
        console.error("Supabase İl Çekme Hatası:", err.message);
    }
}

async function ilceleriYukle(ilKodu) {
    try {
        durumGuncelle("İlçeler çekiliyor...");
        ilceKaynak.clear();
        
        ilceSelect.innerHTML = '<option value="">Yükleniyor...</option>';
        ilceSelect.disabled = true;

        const { data, error } = await supabase.rpc('get_tr_ilceler_geojson', { gid_1 : ilKodu });

        if (error) throw error;

        if (!data || !data.features || data.features.length === 0) {
            durumGuncelle("RLS policy kontrol edin", true);
            ilceSelect.innerHTML = '<option value="">Veri Bulunamadı</option>';
            return;
        }

        const ilceler = geojsonOkuyucu.readFeatures(data);
        ilceKaynak.addFeatures(ilceler);

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

// 5. ETKİLEŞİM (EVENT LISTENERS)
ilSelect.addEventListener('change', (e) => {
    const secilenIlKodu = e.target.value;

    if (!secilenIlKodu) {
        ilceSelect.innerHTML = '<option value="">Önce İl Seçiniz</option>';
        ilceSelect.disabled = true;
        ilceKaynak.clear();
        haritaGorunumu.animate({ center: ol.proj.fromLonLat([35.2433, 38.9637]), zoom: 6 });
        return;
    }

    const secilenIlFeature = ilKaynak.getFeatures().find(f => (f.get('il_kodu') || f.get('id')) == secilenIlKodu);
    if (secilenIlFeature) {
        const geometri = secilenIlFeature.getGeometry();
        haritaGorunumu.fit(geometri, { padding: [50, 50, 50, 50], duration: 1000 });
    }

    ilceleriYukle(secilenIlKodu);
});

ilceSelect.addEventListener('change', (e) => {
    const secilenIlceKodu = e.target.value;
    if (!secilenIlceKodu) return;

    const secilenIlceFeature = ilceKaynak.getFeatures().find(f => (f.get('ilce_kodu') || f.get('id')) == secilenIlceKodu);
    if (secilenIlceFeature) {
        const geometri = secilenIlceFeature.getGeometry();
        haritaGorunumu.fit(geometri, { padding: [50, 50, 50, 50], duration: 1000 });
    }
});

// Sayfa ilk açıldığında illeri yükleyerek sistemi başlat
illeriYukle();

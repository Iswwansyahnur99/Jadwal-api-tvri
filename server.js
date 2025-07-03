const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
app.use(express.json());

const readJsonFile = async (filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return null;
    }
};

const getWitaTime = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Makassar' }));

const getWeekOfMonth = (date) => {
    const startDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    const dateOfMonth = date.getDate();
    return Math.ceil((dateOfMonth + startDayOfMonth) / 7);
};

app.get('/api/semua-jadwal-aktif', async (req, res) => {
    const jadwalData = await readJsonFile(path.join(__dirname, 'jadwal.json'));
    const telegramData = await readJsonFile(path.join(__dirname, 'karyawan_telegram.json'));

    if (!jadwalData || !telegramData) {
        return res.status(500).send('Gagal memuat data jadwal atau telegram.');
    }

    const allDays = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
    const today = getWitaTime();
    const activeSchedules = [];
    const dayNameToday = allDays[today.getDay()];
    const weekKeyToday = `MINGGU_${getWeekOfMonth(today)}`;
    const shiftDef = jadwalData.shift_definitions.TRANSMISI_PAGI;

    if (jadwalData.jadwal_transmisi_pagi[weekKeyToday] && jadwalData.jadwal_transmisi_pagi[weekKeyToday][dayNameToday]) {
        const staffNicknames = jadwalData.jadwal_transmisi_pagi[weekKeyToday][dayNameToday];
        const timeDef = today.getDay() === 5 ? shiftDef.waktu_jumat : shiftDef.waktu_senin_kamis;
        const [startTime, endTime] = timeDef.replace(' WITA', '').split(' - ');

        const startDate = new Date(today);
        const [startHour, startMinute] = startTime.split(':');
        startDate.setHours(startHour, startMinute, 0, 0);

        const endDate = new Date(today);
        const [endHour, endMinute] = endTime.split(':');
        endDate.setHours(endHour, endMinute, 0, 0);

        for (const nickname of staffNicknames) {
            if (!nickname) continue;
            const fullName = Object.keys(jadwalData.karyawan).find(k => jadwalData.karyawan[k].nama_panggilan === nickname);
            if (fullName && telegramData[fullName]) {
                activeSchedules.push({
                    nama: fullName,
                    telegram_chat_id: telegramData[fullName].telegram_chat_id,
                    waktu_mulai: startDate.toISOString(),
                    waktu_selesai: endDate.toISOString()
                });
            }
        }
    }
    res.json(activeSchedules);
});

app.get('/api/jadwal/karyawan', async (req, res) => {
    const { chat_id } = req.query;
    if (!chat_id) {
        return res.status(400).send('Chat ID diperlukan.');
    }

    const jadwalData = await readJsonFile(path.join(__dirname, 'jadwal.json'));
    const telegramData = await readJsonFile(path.join(__dirname, 'karyawan_telegram.json'));

    if (!jadwalData || !telegramData) {
        return res.status(500).send('Gagal memuat data jadwal atau telegram.');
    }

    const fullName = Object.keys(telegramData).find(nama => telegramData[nama].telegram_chat_id === chat_id);

    if (!fullName) {
        return res.json({ message: 'Maaf, data Anda tidak ditemukan di sistem. Hubungi admin.' });
    }

    const employeeNickname = jadwalData.karyawan[fullName]?.nama_panggilan;
    const personalSchedule = [];

    for (let i = 1; i <= 4; i++) {
        const weekKey = `MINGGU_${i}`;
        const weekSchedule = jadwalData.jadwal_transmisi_pagi[weekKey];
        const dailySchedules = [];

        Object.keys(weekSchedule).forEach(day => {
            const staffOnDuty = weekSchedule[day];
            if (staffOnDuty.some(nama => nama && nama.toLowerCase() === employeeNickname.toLowerCase())) {
                dailySchedules.push(day);
            }
        });
        if(dailySchedules.length > 0) {
            personalSchedule.push({
                minggu: `Minggu ke-${i}`,
                hari: dailySchedules.join(', ')
            });
        }
    }

    if (personalSchedule.length === 0) {
        return res.json({ message: `Halo ${fullName}, Anda tidak memiliki jadwal jaga Transmisi Pagi bulan ini.` });
    }

    res.json({
        nama: fullName,
        jadwal: personalSchedule
    });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`API Server berjalan di http://localhost:${PORT}`));
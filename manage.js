// ... 前面的程式碼保持不變 ...

function parseADIF(content) {
    const records = []; let current = {}; let pos = 0; const len = content.length;
    const headerEnd = content.toUpperCase().indexOf('<EOH>'); if (headerEnd !== -1) pos = headerEnd + 5;
    while (pos < len) {
        const tagStart = content.indexOf('<', pos); if (tagStart === -1) break;
        const tagEnd = content.indexOf('>', tagStart); if (tagEnd === -1) break;
        const tagFull = content.substring(tagStart + 1, tagEnd).trim();
        const parts = tagFull.split(':'); const fieldName = parts[0].trim().toUpperCase();
        let fieldLen = parts.length > 1 ? parseInt(parts[1].trim(), 10) : null; pos = tagEnd + 1;
        let value = '';
        if (fieldLen !== null && !isNaN(fieldLen)) { value = content.substring(pos, pos + fieldLen).trim(); pos += fieldLen; } 
        else { if (fieldName === 'EOR') { if (Object.keys(current).length > 0) { records.push({ ...current }); current = {}; } } continue; }
        
        if (fieldName === 'EOR') { 
            if (Object.keys(current).length > 0) { records.push({ ...current }); current = {}; } 
        } 
        else if (fieldName === 'QSO_DATE') { let d = value; if (d.length === 8) d = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`; current.date = d; } 
        else if (fieldName === 'TIME_ON') { let t = value; if (t.length >= 4) t = `${t.slice(0,2)}:${t.slice(2,4)}`; current.time = t; }
        else if (fieldName === 'CALL') { current.call = value.toUpperCase(); } 
        else if (fieldName === 'BAND') { current.band = value; } 
        else if (fieldName === 'MODE') { current.mode = value.toUpperCase(); } 
        else if (fieldName === 'FREQ') { current.freq = parseFloat(value); } // 🌟 抓取頻率
        else if (fieldName === 'SAT_NAME') { current.satName = value.toUpperCase(); }
        else if (fieldName === 'COMMENT' || fieldName === 'NOTES') { current.note = (current.note || '') + value; }
    }
    if (Object.keys(current).length > 0) records.push({ ...current });
    return records;
}

async function uploadADIF() {
    // ... (前面的讀取邏輯保持不變) ...
            reader.onload = function(e) {
                const parsed = parseADIF(e.target.result);
                for (const p of parsed) {
                    if (!p.call) continue;
                    
                    const isDuplicate = existingRecords.some(ex => {
                        if (ex.call !== p.call || ex.mode !== p.mode || ex.date !== p.date) return false;
                        if (p.freq && ex.note) {
                            const match = ex.note.match(/FREQ:([\d.]+)/);
                            if (match) {
                                const exFreq = parseFloat(match[1]);
                                if (Math.abs(exFreq - p.freq) > 0.005) return false;
                            }
                        } else if (ex.band !== p.band) {
                            return false;
                        }
                        const exTime = timeToMinutes(ex.time);
                        const newTime = timeToMinutes(p.time);
                        return Math.abs(exTime - newTime) <= 3;
                    });

                    if (isDuplicate) { duplicateCount++; continue; }

                    let noteStr = p.note || '';
                    if (p.satName) noteStr = `[${p.satName}] 衛星通聯 ${noteStr}`.trim();
                    if (p.freq) noteStr = `FREQ:${p.freq} ${noteStr}`.trim();

                    // 🌟 核心修改：如果 ADIF 有精準頻率，就把頻率存進 band 欄位；否則存原本的 band
                    let finalBand = p.band || '—';
                    if (p.freq) {
                        finalBand = p.freq.toString();
                    }

                    allNewRecords.push({ 
                        date: p.date || '—', 
                        time: p.time || '—',
                        call: p.call, 
                        band: finalBand, // 這裡存進去
                        mode: p.mode || '—', 
                        note: noteStr, 
                        requests: [] 
                    });
                }
                // ... (後續寫入資料庫邏輯保持不變) ...

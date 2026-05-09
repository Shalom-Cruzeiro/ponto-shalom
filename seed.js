const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const DATA_DIR = process.env.RENDER_DISK_MOUNT_PATH || path.join(__dirname, 'data')
const DB_PATH = path.join(DATA_DIR, 'ponto.db')

const db = new sqlite3.Database(DB_PATH)

const LOJAS = [
  'Loja do Cruzeiro - Estação',
  'Loja do Cruzeiro - DelRey',
  'Loja do Cruzeiro - Betim',
  'Loja do Cruzeiro - Minas',
  'Loja do Cruzeiro - BH Outlet',
  'Loja do Cruzeiro - ViaShopping',
  'Loja do Cruzeiro - Itaú',
  'Loja do Cruzeiro - Boulevard',
  'Loja do Cruzeiro - Ipatinga',
  'Loja do Cruzeiro - Shopping Cidade',
  'Loja do Cruzeiro - Savassi',
  'Loja do Cruzeiro - Valadares',
  'Loja do Cruzeiro - Itabira'
]

db.serialize(() => {
  db.all('SELECT id, nome FROM lojas ORDER BY id', [], (err, rows) => {
    if (err) { console.error(err); return }
    rows.forEach((row, i) => {
      if (LOJAS[i]) {
        db.run('UPDATE lojas SET nome = ? WHERE id = ?', [LOJAS[i], row.id], () => {
          console.log(`Atualizado: ${row.nome} → ${LOJAS[i]}`)
        })
        db.run('INSERT OR IGNORE INTO config (loja_id) VALUES (?)', [row.id])
      }
    })
    setTimeout(() => {
      db.all('SELECT id, nome FROM lojas ORDER BY id', [], (e, r) => {
        console.log('\nLojas atualizadas:')
        r.forEach(l => console.log(` ${l.id}: ${l.nome}`))
        db.close()
      })
    }, 1000)
  })
})

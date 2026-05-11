const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const DATA_DIR = process.env.RENDER_DISK_MOUNT_PATH || path.join(__dirname, 'data')
const db = new sqlite3.Database(path.join(DATA_DIR, 'ponto.db'))
const LOJAS = [
  ['Loja do Cruzeiro - Estacao','Loja do Cruzeiro - Estacao'],
  ['Loja do Cruzeiro - DelRey','Loja do Cruzeiro - DelRey'],
  ['Loja do Cruzeiro - Betim','Loja do Cruzeiro - Betim'],
  ['Loja do Cruzeiro - Minas','Loja do Cruzeiro - Minas'],
  ['Loja do Cruzeiro - BH Outlet','Loja do Cruzeiro - BH Outlet'],
  ['Loja do Cruzeiro - ViaShopping','Loja do Cruzeiro - ViaShopping'],
  ['Loja do Cruzeiro - Itau','Loja do Cruzeiro - Itau'],
  ['Loja do Cruzeiro - Boulevard','Loja do Cruzeiro - Boulevard'],
  ['Loja do Cruzeiro - Ipatinga','Loja do Cruzeiro - Ipatinga'],
  ['Loja do Cruzeiro - Shopping Cidade','Loja do Cruzeiro - Shopping Cidade'],
  ['Loja do Cruzeiro - Savassi','Loja do Cruzeiro - Savassi'],
  ['Loja do Cruzeiro - Valadares','Loja do Cruzeiro - Valadares'],
  ['Loja do Cruzeiro - Itabira','Loja do Cruzeiro - Itabira']
]
db.serialize(function() {
  db.all('SELECT id, nome FROM lojas ORDER BY id', [], function(err, rows) {
    if (err) { console.error(err); return }
    if (!rows || rows.length === 0) {
      LOJAS.forEach(function(l) {
        db.run('INSERT OR IGNORE INTO lojas (nome, senha) VALUES (?, ?)', [l[0], '1234'])
      })
      console.log('13 lojas inseridas.')
    } else {
      rows.forEach(function(row, i) {
        if (LOJAS[i]) {
          db.run('DELETE FROM lojas WHERE nome = ? AND id != ?', [LOJAS[i][0], row.id])
          db.run('UPDATE lojas SET nome = ? WHERE id = ?', [LOJAS[i][0], row.id], function() {
            console.log('Atualizado: ' + row.nome + ' -> ' + LOJAS[i][0])
          })
        }
      })
    }
    setTimeout(function() {
      db.all('SELECT id, nome FROM lojas ORDER BY id', [], function(e, r) {
        console.log('\nLojas atualizadas:')
        r.forEach(function(l) { console.log(' ' + l.id + ': ' + l.nome) })
        db.close()
      })
    }, 1000)
  })
})

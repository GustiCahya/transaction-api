//Node Modules
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const knex = require('knex');

//Utililities
const getChance = require('./utils/getChance');

//Initialize app and db
const app = express();
const db = knex({
    client: 'pg',
    connection: {
        host: '127.0.0.1',
        user: 'postgres',
        password: '12345678',
        database: 'transaction'
    }
})

//Middlewares
app.use(bodyParser.json());
app.use(cors());

//Home
app.get('/', (req, res) => {
    res.json('Selamat datang di transaksi api');
})

//Transaction Logic
app.post('/transaction', (req, res) => {
    let {customer_id, trx_amount} = req.body;

    //If request amount is empty
    if(trx_amount === null || trx_amount === undefined || trx_amount === ''){
        trx_amount = 0;
    }

    db.select('disc_percentage', 'probability')
    .from('tiers')
    .where('min_trx', '<=', trx_amount)
    .andWhere('max_trx', '>', trx_amount)
    .then(data => {

        //If there wasn't in the Tiers
        if(data.length < 1){
            data[0] = {
                disc_percentage: 0,
                probability: 0
            }
        }

        const {disc_percentage, probability} = data[0];
        const is_discount = getChance(probability);

        const disc_amount = trx_amount * disc_percentage;
        const paid_amount = trx_amount * (1 - disc_percentage);
        const trx_datetime = new Date();
        const format = {
            datetime: trx_datetime.toLocaleString(),
            amount: parseInt(trx_amount).toLocaleString().replace(/,/gm, '.'),
            discount: disc_percentage*100,
            paid_amount: parseInt(paid_amount).toLocaleString().replace(/,/gm, '.')
        }

        if(is_discount){
            //Success get discount
            res.json([
                {
                    message: `Transaksi anda pada tanggal ${format.datetime} sebesar Rp ${format.amount} berhasil mendapatkan diskon sebesar ${format.discount}% menjadi Rp ${format.paid_amount}`
                },
                {
                    customer_id,
                    trx_amount,
                    trx_datetime,
                    is_discount,
                    disc_percentage,
                    disc_amount,
                    paid_amount
                }
            ]);
        }else{
            //Fail get discount
            res.json([
                {
                    message: `Transaksi anda pada tanggal ${format.datetime} sebesar Rp ${format.amount}`
                },
                {
                    customer_id,
                    trx_amount,
                    trx_datetime,
                    is_discount,
                    disc_percentage,
                    disc_amount,
                    paid_amount
                }
            ]);
        }
    })
    .catch(err => res.status(400).json([{message: err.message}]));
})

//CRUD Tiers
app.get('/tiers', (req, res) => {
    db.select('*')
    .from('tiers')
    .then(tiers => res.json(tiers))
    .catch(err => res.status(400).json([{message: 'Tidak bisa mengakses tingkatan saat ini, coba beberapa saat lagi'}]));
})
app.get('/tiers/:id', (req, res) => {
    const {id} = req.params;
    db.select('*')
    .from('tiers')
    .where({id: id})
    .then(tier => {
        (tier.length > 0) 
        ? res.json(tier[0]) 
        : res.status(400).json([{message: 'Id tidak ditemukan'}])
    })
    .catch(err => res.status(400).json([{message: 'Id tidak ditemukan'}]));
})
app.post('/tiers/create', (req, res) => {
    const {min_trx, max_trx} = req.body
    db.transaction(trx => {
        return trx.select('id')
        .from('tiers')
        .where(function() {
            this.where('min_trx', '<=', min_trx).andWhere('max_trx', '>', min_trx)
        })
        .orWhere(function() {
            this.where('min_trx', '<=', max_trx).andWhere('max_trx', '>=', max_trx)
        })
        .then(data => {
            if(data.length < 1 && Number(min_trx) < Number(max_trx)){
                return trx('tiers')
                .returning('*')
                .insert(req.body)
                .then(tier => {
                    res.json([{message: `Berhasil membuat tingkatan`}, tier[0]])
                })
                .catch(err => res.status(400).json('Gagal membuat tingkatan.'));
            }else{
                res.status(400).json([{message: 'Gagal membuat tingkatan, harap perhatikan minimum dan maximum transaksinya!'}]);
            }
        })
        .catch(err => res.status(400).json([{message: 'Gagal membuat tingkatan.'}]));
    });  
})
app.put('/tiers/update', (req, res) => {
    const {id, min_trx, max_trx} = req.body;
    db.transaction(trx => {
        return trx.select('id')
        .from('tiers')
        .whereNot('id', id)
        .andWhere(function() {
            this.where('min_trx', '<=', min_trx).andWhere('max_trx', '>', min_trx)
        })
        .orWhere(function() {
            this.where('min_trx', '<=', max_trx).andWhere('max_trx', '>=', max_trx)
        })
        .andWhereNot('id', id)
        .then(data => {
            if(data.length < 1 && Number(min_trx) < Number(max_trx)){
                return trx('tiers')
                .update(req.body)
                .where({id: id})
                .returning('*')
                .then(tier => {
                    (tier.length > 0) 
                    ? res.json([{message: `Berhasil menyunting tingkatan ${id}`}, tier[0]]) 
                    : res.status(400).json([{message: 'Id tidak ditemukan untuk disunting'}])
                })
                .catch(err => res.status(400).json([{message: 'Gagal menyunting tingkatan'}])); 
            }else{
                res.status(400).json([{message: 'Gagal menyunting tingkatan, harap perhatikan minimum dan maximum transaksinya!'}]);
            }
        })
        .catch(err => res.status(400).json([{message: 'Gagal menyunting tingkatan'}]));
    })
})
app.delete('/tiers/delete', (req, res) => {
    const {id} = req.body;
    db('tiers')
    .where({id: id})
    .del()
    .returning('*')
    .then(tier => {
        (tier.length > 0) 
        ? res.json([{message: `Berhasil menghapus tingkatan ${id}`}, tier[0]]) 
        : res.status(400).json([{message: 'Id tidak ditemukan untuk dihapus'}])
    })
    .catch(err => res.status(400).json([{message: 'Gagal menghapus tingkatan'}]));
})
app.delete('/tiers/deleteAll', (req, res) => {
    db('tiers')
    .del()
    .returning('*')
    .then(tiers => res.json([{message: 'Berhasil menghapus seluruh tingkatan'}, {tiers: tiers}]))
    .catch(err => res.status(400).json([{message: 'Gagal menghapus seluruh tingkatan'}]));
})

//Run server
app.listen(3001, () => {
    console.log('server running on port 3001');
})

const PDFDocument = require('pdfkit');
const pool = require('../config/database');

function money(value) {
    return new Intl.NumberFormat('pt-PT', {
        style: 'currency',
        currency: 'AOA',
        minimumFractionDigits: 2
    }).format(Number(value || 0));
}

function dataHora(value) {
    return new Intl.DateTimeFormat('pt-PT', {
        dateStyle: 'short',
        timeStyle: 'medium'
    }).format(new Date(value));
}

function cabecalho(doc, titulo, subtitulo) {
    doc.fontSize(18).fillColor('#17365d').font('Helvetica-Bold')
       .text('PRISMA EDUCACIONAL', 50, 45);
    doc.fontSize(9).fillColor('#5d6875').font('Helvetica')
       .text('BANKING — AMBIENTE DE FORMAÇÃO', 50, 68);
    doc.moveTo(50, 86).lineTo(545, 86).strokeColor('#b9c4d0').stroke();
    doc.moveDown(2);
    doc.fontSize(15).fillColor('#1d2d3d').font('Helvetica-Bold').text(titulo);
    if (subtitulo) doc.fontSize(9).fillColor('#687684').font('Helvetica').text(subtitulo);
}

function rodape(doc) {
    const y = 770;
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#d0d7de').stroke();
    doc.fontSize(8).fillColor('#6b7280')
       .text('Documento emitido pelo PRISMA Banking — sistema de simulação para formação. Não constitui documento bancário real.', 50, y + 8, {width:495});
}

async function extratoConta(req, res) {
    const { contaId } = req.params;

    try {
        const conta = await pool.query(`
            SELECT c.numero_conta,c.tipo_conta,c.moeda,c.saldo,c.estado,
                   c.data_abertura,cl.numero_cliente,cl.nome_completo
            FROM contas c
            INNER JOIN clientes cl ON cl.id=c.cliente_id
            WHERE c.id=$1
        `, [contaId]);

        if (!conta.rows.length) return res.status(404).json({success:false,message:'Conta não encontrada.'});

        const movimentos = await pool.query(`
            SELECT tipo,valor,saldo_anterior,saldo_posterior,referencia,descricao,criado_em
            FROM movimentos
            WHERE conta_id=$1
            ORDER BY criado_em ASC
        `, [contaId]);

        const row = conta.rows[0];
        const doc = new PDFDocument({size:'A4', margin:50});
        res.status(200);
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="extrato-${row.numero_conta}.pdf"`);
        doc.pipe(res);

        cabecalho(doc,'Extrato de conta',`Conta ${row.numero_conta} • Cliente ${row.numero_cliente}`);
        doc.fontSize(10).fillColor('#273746').font('Helvetica-Bold').text(row.nome_completo);
        doc.font('Helvetica').fontSize(9).fillColor('#66717d')
           .text(`Tipo: ${row.tipo_conta}   Estado: ${row.estado}   Saldo atual: ${money(row.saldo)}`);
        doc.moveDown(1);

        const cols=[50,120,220,300,385,485];
        const heads=['Data','Referência','Tipo','Valor','Saldo','Descrição'];
        doc.rect(50,145,495,22).fill('#eaf0f6');
        heads.forEach((h,i)=>doc.fontSize(8).fillColor('#17365d').font('Helvetica-Bold').text(h,cols[i],152,{width:i===5?60:75}));
        let y=178;
        for (const m of movimentos.rows) {
            if (y>720) { rodape(doc); doc.addPage(); cabecalho(doc,'Extrato de conta — continuação',row.numero_conta); y=120; }
            doc.font('Helvetica').fontSize(7.5).fillColor('#273746');
            doc.text(new Date(m.criado_em).toLocaleDateString('pt-PT'),cols[0],y,{width:65});
            doc.text(m.referencia||'—',cols[1],y,{width:95});
            doc.text(m.tipo||'—',cols[2],y,{width:75});
            doc.text(money(m.valor),cols[3],y,{width:80});
            doc.text(money(m.saldo_posterior),cols[4],y,{width:95});
            doc.text(m.descricao||'',cols[5],y,{width:60});
            y+=24;
        }
        rodape(doc);
        doc.end();
    } catch(error) {
        console.error('Erro ao gerar extrato:',error);
        res.status(500).json({success:false,message:'Não foi possível gerar o extrato em PDF.'});
    }
}

async function comprovativoPDF(req,res) {
    const { id } = req.params;
    try {
        const r=await pool.query(`
            SELECT cp.*,u.codigo_operador,u.nome_exibicao,
                   cl.numero_cliente,cl.nome_completo,
                   c.numero_conta
            FROM comprovativos cp
            LEFT JOIN usuarios u ON u.id=cp.utilizador_id
            LEFT JOIN clientes cl ON cl.id=cp.cliente_id
            LEFT JOIN contas c ON c.id=cp.conta_id
            WHERE cp.id=$1
        `,[id]);
        if(!r.rows.length) return res.status(404).json({success:false,message:'Comprovativo não encontrado.'});

        const row=r.rows[0];
        const dados=row.dados||{};
        const doc=new PDFDocument({size:'A4',margin:50});
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Content-Disposition',`inline; filename="${row.numero_documento}.pdf"`);
        doc.pipe(res);
        cabecalho(doc,row.titulo||'Comprovativo',`${row.numero_documento} • ${dataHora(row.criado_em)}`);

        const linhasPadrao=[
            ['Documento',row.numero_documento],
            ['Tipo',row.tipo_documento],
            ['Cliente',row.nome_completo||dados.cliente_nome||'—'],
            ['Nº Cliente',row.numero_cliente||dados.numero_cliente||'—'],
            ['Conta',row.numero_conta||dados.numero_conta||'—'],
            ['Operador',`${row.codigo_operador||'—'} — ${row.nome_exibicao||'—'}`],
            ['Referência',dados.referencia||dados.referencia_operacao||'—'],
            ['Valor',dados.valor!==undefined?money(dados.valor):'—'],
            ['Descrição',dados.descricao||'—']
        ];
        const linhasPersonalizadas=Array.isArray(dados.linhas)
            ? dados.linhas
                .filter(linha=>Array.isArray(linha) && linha.length>=2)
                .map(([label,value])=>[String(label??''),String(value??'')])
            : [];
        const linhas=linhasPersonalizadas.length ? linhasPersonalizadas : linhasPadrao;

        let y=145;
        for(const [label,value] of linhas){
            if(y>700){
                rodape(doc);
                doc.addPage();
                cabecalho(doc,'Comprovativo — continuação',row.numero_documento);
                y=120;
            }
            const textoValor=String(value);
            const altura=Math.max(34,Math.min(72,18+Math.ceil(textoValor.length/55)*14));
            doc.roundedRect(50,y,495,altura,3).fillAndStroke('#f5f7fa','#d3dbe3');
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#536273').text(label,65,y+10,{width:90});
            doc.font('Helvetica').fillColor('#1f2d3d').text(textoValor,160,y+10,{width:365});
            y+=altura+8;
        }
        doc.moveDown(2);
        doc.fontSize(9).fillColor('#66717d').text('Documento pedagógico de simulação. Sem valor legal ou financeiro.',50,y+10,{width:495,align:'center'});
        rodape(doc);
        doc.end();
    }catch(error){
        console.error('Erro ao gerar comprovativo PDF:',error);
        res.status(500).json({success:false,message:'Não foi possível gerar o comprovativo em PDF.'});
    }
}

module.exports={extratoConta,comprovativoPDF};

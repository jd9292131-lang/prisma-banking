const pool = require('../config/database');

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    /* =========================================================
       NÚCLEO DA BASE DE DADOS
       A inicialização deve conseguir preparar uma BD vazia.
       As versões anteriores assumiam que estas quatro tabelas
       já existiam, o que fazia uma instalação limpa falhar.
       ========================================================= */
    await client.query(`
      CREATE TABLE IF NOT EXISTS perfis (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome VARCHAR(40) NOT NULL UNIQUE,
        descricao TEXT,
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS permissoes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        codigo VARCHAR(100) NOT NULL UNIQUE,
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS perfil_permissoes (
        perfil_id UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
        permissao_id UUID NOT NULL REFERENCES permissoes(id) ON DELETE CASCADE,
        PRIMARY KEY (perfil_id, permissao_id)
      );

      CREATE TABLE IF NOT EXISTS usuarios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        codigo_operador VARCHAR(30),
        nome_utilizador VARCHAR(60) NOT NULL,
        nome_exibicao VARCHAR(160) NOT NULL,
        senha_hash TEXT NOT NULL,
        perfil_id UUID NOT NULL REFERENCES perfis(id),
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        ultimo_login TIMESTAMP,
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS clientes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        numero_cliente VARCHAR(30) NOT NULL UNIQUE,
        nome_completo VARCHAR(180) NOT NULL,
        nif VARCHAR(40),
        numero_bi VARCHAR(40),
        data_nascimento DATE,
        sexo VARCHAR(20),
        telefone VARCHAR(40),
        email VARCHAR(160),
        endereco TEXT,
        cidade VARCHAR(100),
        tipo_cliente VARCHAR(30) NOT NULL DEFAULT 'PARTICULAR',
        estado VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
        criado_por UUID REFERENCES usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO perfis (nome, descricao) VALUES
        ('FORMADOR', 'Perfil de gestão e formação do ambiente de simulação.'),
        ('FORMANDO', 'Perfil de execução e consulta para formandos.')
      ON CONFLICT (nome) DO NOTHING;
    `);

    /* =========================================================
       IDENTIDADE PROFISSIONAL DOS OPERADORES
       ========================================================= */
    await client.query(`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS codigo_operador VARCHAR(30)
    `);

    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS operador_codigo_seq START 1
    `);

    await client.query(`
      WITH numerados AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS numero
        FROM usuarios
        WHERE codigo_operador IS NULL
      )
      UPDATE usuarios u
      SET codigo_operador = 'OP-' || LPAD(n.numero::text, 6, '0')
      FROM numerados n
      WHERE u.id = n.id
    `);

    await client.query(`
      SELECT setval(
        'operador_codigo_seq',
        GREATEST(
          COALESCE(
            (SELECT MAX(NULLIF(SUBSTRING(codigo_operador FROM 4), '')::BIGINT)
             FROM usuarios
             WHERE codigo_operador ~ '^OP-[0-9]+$'), 0
          ),
          1
        ),
        COALESCE(
          (SELECT MAX(NULLIF(SUBSTRING(codigo_operador FROM 4), '')::BIGINT)
           FROM usuarios
           WHERE codigo_operador ~ '^OP-[0-9]+$'), 0
        ) > 0
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_nome_utilizador_lower
      ON usuarios(LOWER(nome_utilizador))
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_codigo_operador
      ON usuarios(codigo_operador)
    `);

    /* Documento de identificação do cliente */
    await client.query(`
      ALTER TABLE clientes
      ADD COLUMN IF NOT EXISTS numero_bi VARCHAR(40)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clientes_numero_bi
      ON clientes(numero_bi)
    `);

    /* Sequências transacionais para referências humanas sem colisões. */
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS cliente_numero_seq START 1;
      CREATE SEQUENCE IF NOT EXISTS conta_numero_seq START 1;
      CREATE SEQUENCE IF NOT EXISTS cheque_numero_seq START 1;
      CREATE SEQUENCE IF NOT EXISTS cartao_numero_seq START 1;
    `);

    await client.query(`
      SELECT setval(
        'cliente_numero_seq',
        COALESCE(
          (SELECT MAX(CAST(SUBSTRING(numero_cliente FROM 5) AS BIGINT))
           FROM clientes
           WHERE numero_cliente ~ '^CLI-[0-9]+$'),
          1
        ),
        COALESCE(
          (SELECT MAX(CAST(SUBSTRING(numero_cliente FROM 5) AS BIGINT))
           FROM clientes
           WHERE numero_cliente ~ '^CLI-[0-9]+$'),
          0
        ) > 0
      )
    `);



    await client.query(`
      CREATE TABLE IF NOT EXISTS documentos_cliente (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
        tipo_documento VARCHAR(60) NOT NULL,
        numero_documento VARCHAR(100),
        estado VARCHAR(20) NOT NULL DEFAULT 'VALIDO',
        observado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        numero_conta VARCHAR(30) UNIQUE NOT NULL,
        cliente_id UUID NOT NULL REFERENCES clientes(id),
        tipo_conta VARCHAR(30) NOT NULL CHECK (tipo_conta IN ('ORDEM','PRAZO','SALARIO','POUPANCA')),
        moeda VARCHAR(10) NOT NULL DEFAULT 'AOA',
        saldo NUMERIC(18,2) NOT NULL DEFAULT 0,
        estado VARCHAR(20) NOT NULL DEFAULT 'ATIVA',
        deposito_inicial NUMERIC(18,2) NOT NULL DEFAULT 0,
        data_abertura TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        criado_por UUID REFERENCES usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      SELECT setval(
        'conta_numero_seq',
        COALESCE((SELECT MAX(CAST(SUBSTRING(numero_conta FROM 5) AS BIGINT)) FROM contas WHERE numero_conta ~ '^CTA-[0-9]+$'),1),
        COALESCE((SELECT MAX(CAST(SUBSTRING(numero_conta FROM 5) AS BIGINT)) FROM contas WHERE numero_conta ~ '^CTA-[0-9]+$'),0) > 0
      );

      CREATE TABLE IF NOT EXISTS movimentos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conta_id UUID NOT NULL REFERENCES contas(id),
        tipo VARCHAR(40) NOT NULL,
        valor NUMERIC(18,2) NOT NULL CHECK (valor >= 0),
        saldo_anterior NUMERIC(18,2) NOT NULL DEFAULT 0,
        saldo_posterior NUMERIC(18,2) NOT NULL DEFAULT 0,
        referencia VARCHAR(80),
        descricao TEXT,
        utilizador_id UUID REFERENCES usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transferencias (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        referencia VARCHAR(40) UNIQUE NOT NULL,
        conta_origem_id UUID NOT NULL REFERENCES contas(id),
        conta_destino_id UUID,
        banco_destino VARCHAR(120),
        tipo VARCHAR(30) NOT NULL,
        modalidade VARCHAR(30) NOT NULL,
        valor NUMERIC(18,2) NOT NULL CHECK (valor > 0),
        comissao NUMERIC(18,2) NOT NULL DEFAULT 0,
        data_agendada TIMESTAMP,
        estado VARCHAR(30) NOT NULL DEFAULT 'CONCLUIDA',
        descricao TEXT,
        utilizador_id UUID REFERENCES usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS caixa_operacoes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        referencia VARCHAR(40) UNIQUE NOT NULL,
        tipo VARCHAR(30) NOT NULL,
        conta_id UUID REFERENCES contas(id),
        valor NUMERIC(18,2) NOT NULL CHECK (valor > 0),
        saldo_caixa_anterior NUMERIC(18,2) NOT NULL DEFAULT 0,
        saldo_caixa_posterior NUMERIC(18,2) NOT NULL DEFAULT 0,
        utilizador_id UUID REFERENCES usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pagamentos_servicos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conta_id UUID NOT NULL REFERENCES contas(id),
        entidade VARCHAR(120) NOT NULL,
        referencia_servico VARCHAR(120) NOT NULL,
        valor NUMERIC(18,2) NOT NULL CHECK (valor > 0),
        comissao NUMERIC(18,2) NOT NULL DEFAULT 0,
        estado VARCHAR(30) NOT NULL DEFAULT 'PAGO',
        utilizador_id UUID REFERENCES usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS creditos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        referencia VARCHAR(40) UNIQUE NOT NULL,
        cliente_id UUID NOT NULL REFERENCES clientes(id),
        tipo_credito VARCHAR(40) NOT NULL,
        valor_solicitado NUMERIC(18,2) NOT NULL,
        prazo_meses INTEGER NOT NULL,
        taxa_anual NUMERIC(8,4) NOT NULL,
        rendimento NUMERIC(18,2) NOT NULL DEFAULT 0,
        encargos NUMERIC(18,2) NOT NULL DEFAULT 0,
        entrada_inicial NUMERIC(18,2) NOT NULL DEFAULT 0,
        prestacao NUMERIC(18,2) NOT NULL DEFAULT 0,
        juros_totais NUMERIC(18,2) NOT NULL DEFAULT 0,
        capital_divida NUMERIC(18,2) NOT NULL DEFAULT 0,
        capacidade_endividamento NUMERIC(8,2) NOT NULL DEFAULT 0,
        capacidade_mensal NUMERIC(18,2) NOT NULL DEFAULT 0,
        taxa_esforco NUMERIC(8,2) NOT NULL DEFAULT 0,
        estado VARCHAR(30) NOT NULL DEFAULT 'SIMULADO',
        utilizador_id UUID REFERENCES usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS analises_risco (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        credito_id UUID REFERENCES creditos(id) ON DELETE CASCADE,
        cliente_id UUID NOT NULL REFERENCES clientes(id),
        rendimento NUMERIC(18,2) NOT NULL,
        despesas NUMERIC(18,2) NOT NULL,
        outros_creditos NUMERIC(18,2) NOT NULL DEFAULT 0,
        score NUMERIC(8,2) NOT NULL DEFAULT 0,
        capacidade NUMERIC(18,2) NOT NULL DEFAULT 0,
        decisao VARCHAR(40) NOT NULL,
        justificacao TEXT NOT NULL,
        utilizador_id UUID REFERENCES usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS caixa_fechos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        data_caixa DATE NOT NULL DEFAULT CURRENT_DATE,
        saldo_sistema NUMERIC(18,2) NOT NULL DEFAULT 0,
        saldo_fisico NUMERIC(18,2) NOT NULL DEFAULT 0,
        diferenca NUMERIC(18,2) NOT NULL DEFAULT 0,
        observacoes TEXT,
        estado VARCHAR(30) NOT NULL DEFAULT 'CONFERIDO',
        utilizador_id UUID REFERENCES usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS auditoria_operacoes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        utilizador_id UUID REFERENCES usuarios(id),
        modulo VARCHAR(60) NOT NULL,
        acao VARCHAR(120) NOT NULL,
        referencia VARCHAR(100),
        detalhes JSONB,
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS comprovativos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        numero_documento VARCHAR(80) UNIQUE NOT NULL,
        tipo_documento VARCHAR(60) NOT NULL,
        movimento_id UUID REFERENCES movimentos(id),
        transferencia_id UUID REFERENCES transferencias(id),
        caixa_operacao_id UUID REFERENCES caixa_operacoes(id),
        cliente_id UUID REFERENCES clientes(id),
        conta_id UUID REFERENCES contas(id),
        titulo VARCHAR(160) NOT NULL,
        dados JSONB NOT NULL DEFAULT '{}'::jsonb,
        utilizador_id UUID REFERENCES usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );


      /*
       * Permissão específica para eliminação de clientes.
       * Atribuída exclusivamente ao perfil FORMADOR.
       * O servidor também valida esta permissão antes da eliminação.
       */
      INSERT INTO permissoes (codigo)
      SELECT 'CLIENTES_ELIMINAR'
      WHERE NOT EXISTS (
        SELECT 1
        FROM permissoes
        WHERE codigo = 'CLIENTES_ELIMINAR'
      );

      INSERT INTO perfil_permissoes (perfil_id, permissao_id)
      SELECT pf.id, pm.id
      FROM perfis pf
      CROSS JOIN permissoes pm
      WHERE pf.nome = 'FORMADOR'
        AND pm.codigo = 'CLIENTES_ELIMINAR'
        AND NOT EXISTS (
            SELECT 1
            FROM perfil_permissoes existente
            WHERE existente.perfil_id = pf.id
              AND existente.permissao_id = pm.id
        );
    `);


    /* =========================================================
       MÓDULOS PEDAGÓGICOS E DE OPERAÇÃO COMPLEMENTARES
       ========================================================= */
    await client.query(`
      CREATE TABLE IF NOT EXISTS cartoes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        numero_cartao VARCHAR(32) UNIQUE NOT NULL,
        cliente_id UUID NOT NULL REFERENCES clientes(id),
        conta_id UUID NOT NULL REFERENCES contas(id),
        tipo VARCHAR(30) NOT NULL DEFAULT 'DEBITO',
        estado VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
        validade DATE NOT NULL,
        limite NUMERIC(18,2) NOT NULL DEFAULT 0,
        criado_por UUID REFERENCES usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cheques (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        numero_cheque VARCHAR(40) UNIQUE NOT NULL,
        conta_id UUID NOT NULL REFERENCES contas(id),
        beneficiario VARCHAR(160) NOT NULL,
        valor NUMERIC(18,2) NOT NULL CHECK (valor > 0),
        data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
        data_validade DATE,
        estado VARCHAR(25) NOT NULL DEFAULT 'EMITIDO',
        descricao TEXT,
        criado_por UUID REFERENCES usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE contas
      ADD COLUMN IF NOT EXISTS valor_reservado_cheques NUMERIC(18,2) NOT NULL DEFAULT 0;

      ALTER TABLE contas
      ADD COLUMN IF NOT EXISTS valor_reservado_transferencias NUMERIC(18,2) NOT NULL DEFAULT 0;

      ALTER TABLE creditos
      ADD COLUMN IF NOT EXISTS capacidade_mensal NUMERIC(18,2) NOT NULL DEFAULT 0;

      ALTER TABLE creditos
      ADD COLUMN IF NOT EXISTS taxa_esforco NUMERIC(8,2) NOT NULL DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_transferencias_agendadas
      ON transferencias(estado, data_agendada);

      CREATE INDEX IF NOT EXISTS idx_cheques_conta_estado
      ON cheques(conta_id, estado);

      SELECT setval(
        'cartao_numero_seq',
        COALESCE(
          (SELECT MAX(CAST(numero_cartao AS BIGINT))
           FROM cartoes
           WHERE numero_cartao ~ '^[0-9]+$'),
          1
        ),
        COALESCE(
          (SELECT MAX(CAST(numero_cartao AS BIGINT))
           FROM cartoes
           WHERE numero_cartao ~ '^[0-9]+$'),
          0
        ) > 0
      );

      SELECT setval(
        'cheque_numero_seq',
        COALESCE(
          (SELECT MAX(CAST(SUBSTRING(numero_cheque FROM 5) AS BIGINT))
           FROM cheques
           WHERE numero_cheque ~ '^CHQ-[0-9]+$'),
          1
        ),
        COALESCE(
          (SELECT MAX(CAST(SUBSTRING(numero_cheque FROM 5) AS BIGINT))
           FROM cheques
           WHERE numero_cheque ~ '^CHQ-[0-9]+$'),
          0
        ) > 0
      );

      CREATE TABLE IF NOT EXISTS exercicios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        titulo VARCHAR(180) NOT NULL,
        enunciado TEXT NOT NULL,
        opcoes JSONB NOT NULL DEFAULT '[]'::jsonb,
        resposta_correta VARCHAR(500) NOT NULL,
        pontos NUMERIC(8,2) NOT NULL DEFAULT 1,
        dificuldade VARCHAR(20) NOT NULL DEFAULT 'MEDIA',
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_por UUID REFERENCES usuarios(id),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS respostas_exercicios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        exercicio_id UUID NOT NULL REFERENCES exercicios(id) ON DELETE CASCADE,
        utilizador_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        resposta TEXT NOT NULL,
        correta BOOLEAN NOT NULL DEFAULT FALSE,
        pontos NUMERIC(8,2) NOT NULL DEFAULT 0,
        respondido_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (exercicio_id, utilizador_id)
      );

      CREATE INDEX IF NOT EXISTS idx_respostas_exercicios_utilizador
        ON respostas_exercicios(utilizador_id);

      CREATE INDEX IF NOT EXISTS idx_auditoria_operacoes_criado
        ON auditoria_operacoes(criado_em DESC);
    `);

    /* Permissões dos módulos. */
    await client.query(`
      INSERT INTO permissoes (codigo)
      VALUES
        ('DASHBOARD_VISUALIZAR'),
        ('CLIENTES_VISUALIZAR'),('CLIENTES_CRIAR'),('CLIENTES_EDITAR'),('CLIENTES_ELIMINAR'),
        ('CONTAS_VISUALIZAR'),('CONTAS_ABRIR'),
        ('MOVIMENTOS_VISUALIZAR'),('CAIXA_OPERAR'),('CAIXA_RECONCILIAR'),
        ('TRANSFERENCIAS_OPERAR'),('CREDITO_SIMULAR'),('CREDITO_OPERAR'),('RISCO_ANALISAR'),
        ('COMPROVATIVOS_EMITIR'),('DOCUMENTOS_VISUALIZAR'),
        ('CARTOES_OPERAR'),('CHEQUES_OPERAR'),
        ('EXERCICIOS_REALIZAR'),('EXERCICIOS_GERIR'),
        ('NOTAS_VISUALIZAR'),('NOTAS_GERIR'),
        ('RELATORIOS_VISUALIZAR'),('USUARIOS_GERIR'),('AUDITORIA_VISUALIZAR')
      ON CONFLICT (codigo) DO NOTHING
    `);

    /* O FORMADOR gere o ambiente pedagógico e operacional. */
    await client.query(`
      INSERT INTO perfil_permissoes (perfil_id, permissao_id)
      SELECT pf.id, pm.id
      FROM perfis pf CROSS JOIN permissoes pm
      WHERE pf.nome = 'FORMADOR'
        AND NOT EXISTS (
          SELECT 1 FROM perfil_permissoes pp
          WHERE pp.perfil_id = pf.id AND pp.permissao_id = pm.id
        )
    `);

    /* O FORMANDO recebe apenas as permissões de execução/consulta. */
    await client.query(`
      INSERT INTO perfil_permissoes (perfil_id, permissao_id)
      SELECT pf.id, pm.id
      FROM perfis pf
      JOIN permissoes pm ON pm.codigo IN (
        'DASHBOARD_VISUALIZAR','CLIENTES_VISUALIZAR','CONTAS_VISUALIZAR',
        'MOVIMENTOS_VISUALIZAR','TRANSFERENCIAS_OPERAR','CAIXA_OPERAR',
        'CREDITO_SIMULAR','CARTOES_OPERAR','CHEQUES_OPERAR','EXERCICIOS_REALIZAR',
        'NOTAS_VISUALIZAR','RELATORIOS_VISUALIZAR','COMPROVATIVOS_EMITIR',
        'DOCUMENTOS_VISUALIZAR'
      )
      WHERE pf.nome = 'FORMANDO'
        AND NOT EXISTS (
          SELECT 1 FROM perfil_permissoes pp
          WHERE pp.perfil_id = pf.id AND pp.permissao_id = pm.id
        )
    `);

    await client.query('COMMIT');
    console.log('Estrutura operacional verificada/criada.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = initializeDatabase;

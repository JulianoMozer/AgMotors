# AG Motors Curitiba

Site público e painel administrativo da AG Motors, construídos com HTML, CSS, JavaScript e Gulp.

## Desenvolvimento

```bash
npm install
npm run dev
```

O comando `npm run build` gera uma publicação limpa em `dist/` e termina sem iniciar o modo de observação.

## Ativação do painel administrativo

1. Crie um projeto no Supabase.
2. Execute `supabase-schema.sql` no SQL Editor.
3. Em Authentication > Users, crie o usuário que terá acesso ao painel.
4. Copie o UUID desse usuário e execute:

```sql
insert into public.admins (user_id) values ('UUID_DO_USUARIO');
```

5. Preencha `src/js/config.js` com a URL do projeto e a chave pública (`anon`/publishable).
6. Execute `npm run build` e publique a pasta `dist/`.

A chave pública do Supabase pode ficar no navegador. Nunca coloque a chave `service_role` no projeto.

## Uso do painel

Acesse `/admin.html`, faça login e utilize **Cadastrar veículo**. O painel permite editar, excluir, destacar e alterar o status para disponível, reservado ou vendido. Veículos vendidos deixam automaticamente de aparecer no site público.

Enquanto o Supabase não estiver configurado, o site público exibe os dois veículos de demonstração mantidos em `src/js/inventory.js`; o painel permanece bloqueado para evitar uma falsa sensação de persistência.

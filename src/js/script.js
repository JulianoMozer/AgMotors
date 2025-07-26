function enviarWhatsApp() {
  const nome = document.getElementById("nome").value;
  const telefone = document.getElementById("telefone").value;
  const dados = document.getElementById("dados").value;

  const mensagem = `Olá! Quero vender meu carro.\n\nNome: ${nome}\nTelefone: ${telefone}\nDados do carro:\n${dados}`;

  const numeroWhatsApp = "5541996155327";
  const url = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensagem)}`;

  window.open(url, "_blank");

  return true; // Permite que o form continue sendo enviado
}

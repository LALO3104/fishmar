let pedidosRepartidor = [];
let userIdActual = null;
let nombreRepartidor = "";

async function verificarSesion() {
  const { data, error } = await supabaseClient.auth.getUser();

  if (error || !data?.user) {
    showToast("No hay sesión activa. Redirigiendo al login.");
    window.location.href = "admin.html";
    return false;
  }

  userIdActual = data.user.id;

  const { data: rolData, error: rolError } = await supabaseClient
    .from("user_roles")
    .select("role, full_name")
    .eq("user_id", userIdActual)
    .single();

  if (rolError || !rolData || rolData.role !== "repartidor") {
    handleError(rolError, "Tu usuario no tiene rol de repartidor.");
    window.location.href = "admin.html";
    return false;
  }

  nombreRepartidor = rolData.full_name || "Repartidor";
  const titulo = document.querySelector(".header h1");
  const subtitulo = document.querySelector(".header p");

  if (titulo) titulo.textContent = `🐟 ${nombreRepartidor}`;
  if (subtitulo) subtitulo.textContent = "Solo tus pedidos asignados";

  return true;
}

async function cargarPedidosRepartidor() {
  const ok = await verificarSesion();
  if (!ok) return;

  const { data, error } = await supabaseClient
    .from("pedidos")
    .select("*")
    .eq("repartidor_id", userIdActual)
    .order("created_at", { ascending: false });

  if (error) {
    handleError(error, "Error al cargar tus pedidos.");
    return;
  }

  pedidosRepartidor = data || [];
  renderPedidosRepartidor();
  actualizarStatsRepartidor();
}

function renderPedidosRepartidor() {
  const cont = document.getElementById("misPedidos");
  if (!cont) return;

  if (!pedidosRepartidor.length) {
    cont.innerHTML = `<div class="panel">No tienes pedidos asignados.</div>`;
    return;
  }

  cont.innerHTML = pedidosRepartidor.map(p => {
    const estadoClass = getEstadoClass(p.estado, p.created_at || p.fecha);
    const fechaLocal = formatearFechaPedido(p);
    const tiempo = calcularTiempoPedido(p);
    const mapa = p.ubicacion ? p.ubicacion : "#";
    const pedidoNumero = p.numero_pedido || `#${p.id}`;

    const itemsHtml = Array.isArray(p.items) && p.items.length
      ? p.items.map(item => `
          <li>${item.nombre} x${item.qty} — $${(Number(item.precio) * Number(item.qty)).toFixed(2)}</li>
        `).join("")
      : `<li>Sin detalle de productos</li>`;

    return `
      <div class="pedido-card ${estadoClass}">
        <div class="pedido-top">
          <div>
            <h3>${p.nombre}</h3>
            <span class="pedido-phone">📞 ${p.telefono}</span>
            <p class="pedido-time">🧾 Pedido: <strong>${pedidoNumero}</strong></p>
            <p class="pedido-time">🕒 ${fechaLocal}</p>
            <p class="pedido-time">⏱️ ${tiempo}</p>
          </div>
          <span class="estado-badge ${estadoClass}">${p.estado}</span>
        </div>

        <div class="pedido-body">
          <p>📍 ${p.direccion}</p>
          <p>💳 ${p.metodo_pago}</p>
          <p>💰 <strong>$${Number(p.total).toFixed(2)}</strong></p>
          <p>📝 ${p.notas || "Sin notas"}</p>

          <div class="pedido-items">
            <strong>Productos:</strong>
            <ul>
              ${itemsHtml}
            </ul>
          </div>
        </div>

        <div class="pedido-actions">
          <select onchange="cambiarEstado(${p.id}, this.value)">
            <option ${p.estado === "Recibido" ? "selected" : ""}>Recibido</option>
            <option ${p.estado === "En proceso" ? "selected" : ""}>En proceso</option>
            <option ${p.estado === "El repartidor está en camino" ? "selected" : ""}>El repartidor está en camino</option>
            <option ${p.estado === "Entregado" ? "selected" : ""}>Entregado</option>
          </select>

          <a href="${mapa}" target="_blank" class="map-btn">Mapa</a>
        </div>
      </div>
    `;
  }).join("");
}

async function cambiarEstado(id, nuevoEstado) {
  const { error } = await supabaseClient
    .from("pedidos")
    .update({ estado: nuevoEstado })
    .eq("id", id);

  if (error) {
    handleError(error, "No se pudo actualizar el pedido.");
    return;
  }

  showToast("Estado actualizado correctamente", "success");
  cargarPedidosRepartidor();
}

function actualizarStatsRepartidor() {
  const asignados = pedidosRepartidor.length;
  const enCamino = pedidosRepartidor.filter(p => p.estado === "El repartidor está en camino").length;
  const entregados = pedidosRepartidor.filter(p => p.estado === "Entregado").length;

  const statAsignados = document.getElementById("statAsignados");
  const statCamino = document.getElementById("statCamino");
  const statEntregadosR = document.getElementById("statEntregadosR");

  if (statAsignados) statAsignados.textContent = asignados;
  if (statCamino) statCamino.textContent = enCamino;
  if (statEntregadosR) statEntregadosR.textContent = entregados;
}

function logout() {
  supabaseClient.auth.signOut();
  window.location.href = "admin.html";
}

// Autoactualización cada 5 segundos
setInterval(() => {
  cargarPedidosRepartidor();
}, 5000);

cargarPedidosRepartidor();

// js/dashboard.js
// Dependencias: supabaseClient (supabase.js), utils.js

let pedidosCache = [];
let productosCache = [];
let repartidoresCache = [];
let chart = null;
let productoEditandoId = null;
let ultimoPedidoId = null;

// Variables para descuento en edición
let descuentoValorActual = 0;
let descuentoTipoActual = 'monto';
let descuentoMontoActual = 0;

// Variables para filtro de productos
let productosFiltrados = [];
let searchProductoTerm = '';
let categoriaProductoFilter = 'all';

// Variables para métricas
let periodoActual = 'hoy';
let fechaInicioPersonalizado = null;
let fechaFinPersonalizado = null;
let chartIngresos = null;
let chartVentasDia = null;

// Variables para super admin
let esSuperAdmin = false;
let listaUsuarios = [];

const audio = new Audio("assets/notification.mp3");

// ======================
// UTILIDADES GENERALES
// ======================

function reproducirNotificacion() {
  audio.play().catch(() => {});
  const alerta = document.createElement("div");
  alerta.className = "alerta-pedido";
  alerta.innerHTML = "🆕 Nuevo pedido recibido";
  document.body.appendChild(alerta);
  setTimeout(() => alerta.remove(), 3000);
}

function getRepartidorNombrePorId(userId) {
  const rep = repartidoresCache.find(r => r.user_id === userId);
  return rep?.full_name || "";
}

function getRepartidorTextoPedido(p) {
  if (p.repartidor_nombre && p.repartidor_nombre.trim()) {
    return p.repartidor_nombre;
  }
  if (p.repartidor_id) {
    const nombre = getRepartidorNombrePorId(p.repartidor_id);
    if (nombre) return nombre;
  }
  return "Sin asignar";
}

// ======================
// VERIFICACIÓN DE SESIÓN
// ======================

async function verificarSesionAdmin() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || !data?.user) {
    showToast("No hay sesión activa. Redirigiendo al login.");
    window.location.href = "admin.html";
    return false;
  }
  const { data: rolData, error: rolError } = await supabaseClient
    .from("user_roles")
    .select("role, is_superadmin")
    .eq("user_id", data.user.id)
    .single();
  if (rolError || !rolData) {
    showToast("No se pudo verificar tu rol.");
    window.location.href = "admin.html";
    return false;
  }
  if (rolData.role !== "admin" && rolData.role !== "superadmin") {
    showToast("No tienes permisos de administrador.");
    window.location.href = "admin.html";
    return false;
  }
  esSuperAdmin = rolData.is_superadmin === true;
  return true;
}

// ======================
// PRODUCTOS (CRUD)
// ======================

async function cargarProductosAdmin() {
  const { data, error } = await supabaseClient
    .from("productos")
    .select("*")
    .order("id", { ascending: false });
  if (error) {
    handleError(error, "Error al cargar productos.");
    return;
  }
  productosCache = data || [];
  filtrarProductos();
}

function filtrarProductos() {
  searchProductoTerm = document.getElementById("searchProducto")?.value.toLowerCase() || '';
  categoriaProductoFilter = document.getElementById("filtroCategoriaProducto")?.value || 'all';
  
  productosFiltrados = productosCache.filter(p => {
    const matchesSearch = p.nombre.toLowerCase().includes(searchProductoTerm);
    const matchesCategoria = categoriaProductoFilter === 'all' || p.categoria === categoriaProductoFilter;
    return matchesSearch && matchesCategoria;
  });
  
  renderProductosAdmin(productosFiltrados);
}

function renderProductosAdmin(productos) {
  const cont = document.getElementById("productosAdmin");
  if (!cont) return;
  if (!productos.length) {
    cont.innerHTML = `<div class="panel">No hay productos que coincidan.</div>`;
    return;
  }
  cont.innerHTML = productos.map(p => {
    const img = p.imagen_url && p.imagen_url.trim() ? p.imagen_url : "https://via.placeholder.com/100";
    const tipoVenta = p.tipo_venta === 'granel' ? 'kg' : 'pieza';
    const subcategoriaHtml = p.subcategoria ? `<small class="subcat">${p.subcategoria}</small>` : '';
    return `
      <div class="admin-item">
        <img src="${img}" alt="${p.nombre}">
        <div>
          <strong>${p.nombre}</strong>
          <p>$${Number(p.precio).toFixed(2)} / ${tipoVenta}</p>
          <small>${p.categoria}</small> ${subcategoriaHtml}
          <p class="product-desc-small">${p.descripcion || 'Sin descripción'}</p>
          <div class="admin-actions">
            <button class="edit-btn" onclick="editarProducto(event, ${p.id})">Editar</button>
            <button class="delete-btn" onclick="eliminarProducto(event, ${p.id})">Eliminar</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function crearProducto() {
  const nombre = document.getElementById("nombre").value.trim();
  const precio = parseFloat(document.getElementById("precio").value);
  const categoria = document.getElementById("categoria").value;
  const imagen_url = document.getElementById("imagen_url").value.trim();
  const descripcion = document.getElementById("descripcion").value.trim();
  const tipoVenta = document.getElementById("tipoVenta").value;
  let subcategoria = null;
  if (categoria === "Marisquería") {
    subcategoria = document.getElementById("subcategoria").value;
    if (!subcategoria) {
      showToast("Selecciona una subcategoría para Marisquería");
      return;
    }
  }
  if (!nombre || isNaN(precio)) {
    showToast("Completa nombre y precio");
    return;
  }

  const nuevoProducto = {
    nombre,
    precio,
    categoria,
    imagen_url: imagen_url || null,
    descripcion: descripcion || null,
    tipo_venta: tipoVenta,
    subcategoria
  };

  if (productoEditandoId) {
    const { error } = await supabaseClient
      .from("productos")
      .update(nuevoProducto)
      .eq("id", productoEditandoId);
    if (error) {
      handleError(error, "Error al editar producto.");
      return;
    }
    productoEditandoId = null;
    showToast("Producto actualizado correctamente", "success");
  } else {
    const { error } = await supabaseClient
      .from("productos")
      .insert([nuevoProducto]);
    if (error) {
      handleError(error, "Error al crear producto.");
      return;
    }
    showToast("Producto creado correctamente", "success");
  }

  limpiarFormulario();
  await cargarProductosAdmin();
}

function editarProducto(event, id) {
  const btn = event.target;
  if (btn) {
    btn.classList.add('clicked');
    setTimeout(() => btn.classList.remove('clicked'), 200);
  }

  const p = productosCache.find(x => x.id === id);
  if (!p) return;

  document.getElementById("nombre").value = p.nombre || "";
  document.getElementById("precio").value = p.precio || "";
  document.getElementById("categoria").value = p.categoria || "Pescadería";
  document.getElementById("imagen_url").value = p.imagen_url || "";
  document.getElementById("descripcion").value = p.descripcion || "";
  document.getElementById("tipoVenta").value = p.tipo_venta || "pieza";
  document.getElementById("previewImg").src = p.imagen_url || "";

  toggleSubcategoria();
  if (p.categoria === "Marisquería") {
    document.getElementById("subcategoria").value = p.subcategoria || "";
  } else {
    document.getElementById("subcategoria").value = "";
  }

  productoEditandoId = id;

  const formPanel = document.getElementById("productFormPanel");
  if (formPanel) {
    formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    formPanel.style.transition = 'box-shadow 0.3s';
    formPanel.style.boxShadow = '0 0 0 4px #0ea5a4';
    setTimeout(() => {
      formPanel.style.boxShadow = '';
    }, 1500);
  }
}

async function eliminarProducto(event, id) {
  const btn = event.target;
  if (btn) {
    btn.classList.add('clicked');
    setTimeout(() => btn.classList.remove('clicked'), 200);
  }

  if (!confirm("¿Eliminar producto? Esta acción no se puede deshacer.")) return;

  const { error } = await supabaseClient.from("productos").delete().eq("id", id);
  if (error) {
    handleError(error, "Error eliminando producto.");
    return;
  }

  showToast("Producto eliminado correctamente", "success");
  cargarProductosAdmin();
}

function limpiarFormulario() {
  const nombre = document.getElementById("nombre");
  const precio = document.getElementById("precio");
  const imagen = document.getElementById("imagen_url");
  const preview = document.getElementById("previewImg");
  const descripcion = document.getElementById("descripcion");
  const tipoVenta = document.getElementById("tipoVenta");
  const categoria = document.getElementById("categoria");
  const subcategoria = document.getElementById("subcategoria");
  if (nombre) nombre.value = "";
  if (precio) precio.value = "";
  if (imagen) imagen.value = "";
  if (preview) preview.src = "";
  if (descripcion) descripcion.value = "";
  if (tipoVenta) tipoVenta.value = "pieza";
  if (categoria) categoria.value = "Pescadería";
  if (subcategoria) subcategoria.value = "";
  const subDiv = document.getElementById("subcategoriaDiv");
  if (subDiv) subDiv.style.display = "none";
  productoEditandoId = null;
}

function toggleSubcategoria() {
  const categoria = document.getElementById("categoria")?.value;
  const subDiv = document.getElementById("subcategoriaDiv");
  if (categoria === "Marisquería") {
    subDiv.style.display = "block";
  } else {
    subDiv.style.display = "none";
  }
}

const imagenInput = document.getElementById("imagen_url");
if (imagenInput) {
  imagenInput.addEventListener("input", e => {
    const preview = document.getElementById("previewImg");
    if (preview) preview.src = e.target.value;
  });
}

// ======================
// REPARTIDORES
// ======================

async function cargarRepartidores() {
  const { data, error } = await supabaseClient
    .from("user_roles")
    .select("user_id, full_name, role")
    .eq("role", "repartidor")
    .order("full_name", { ascending: true });
  if (error) {
    handleError(error, "Error cargando repartidores.");
    return;
  }
  repartidoresCache = data || [];
}

// ======================
// PEDIDOS
// ======================

async function cargarPedidos() {
  const estado = document.getElementById("filtroEstado")?.value || "Todos";
  const fecha = document.getElementById("filtroFecha")?.value || "";
  const { data, error } = await supabaseClient
    .from("pedidos")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    handleError(error, "Error cargando pedidos.");
    return;
  }
  const nuevosPedidos = data || [];
  if (nuevosPedidos.length > 0) {
    if (ultimoPedidoId && nuevosPedidos[0].id !== ultimoPedidoId) {
      reproducirNotificacion();
    }
    ultimoPedidoId = nuevosPedidos[0].id;
  }
  pedidosCache = nuevosPedidos;
  let pedidosFiltrados = [...pedidosCache];
  if (estado !== "Todos") {
    pedidosFiltrados = pedidosFiltrados.filter(p => p.estado === estado);
  }
  if (fecha) {
    pedidosFiltrados = pedidosFiltrados.filter(p => getFechaPedidoFiltro(p) === fecha);
  }
  renderPedidos(pedidosFiltrados);
  renderRepartidores(pedidosFiltrados);  // <-- Aquí se muestra el resumen
  actualizarStats(pedidosCache);
  renderGrafica(pedidosFiltrados);
  actualizarMetricasPeriodo();
}

function renderPedidos(lista) {
  const cont = document.getElementById("pedidos");
  if (!cont) return;
  if (!lista.length) {
    cont.innerHTML = `<div class="panel">No hay pedidos</div>`;
    return;
  }
  cont.innerHTML = lista.map(p => {
    const estadoClass = getEstadoClass(p.estado, p.created_at || p.fecha);
    const fechaLocal = formatearFechaPedido(p);
    const tiempo = calcularTiempoPedido(p);
    const mapa = p.ubicacion ? p.ubicacion : "#";
    const repartidorAsignadoId = p.repartidor_id || "";
    const pedidoNumero = p.numero_pedido || `#${p.id}`;
    const itemsHtml = Array.isArray(p.items) && p.items.length
      ? p.items.map(item => `
          <li>${item.nombre} x${item.qty} — $${(Number(item.precio) * Number(item.qty)).toFixed(2)}</li>
        `).join("")
      : `<li>Sin detalle de productos</li>`;
    const repartidoresOptions = repartidoresCache.length
      ? repartidoresCache.map(r => `
          <option value="${r.user_id}" ${r.user_id === repartidorAsignadoId ? "selected" : ""}>
            ${r.full_name || "Sin nombre"}
          </option>
        `).join("")
      : `<option value="">No hay repartidores</option>`;

    let descuentoHtml = '';
    if (p.descuento_monto && p.descuento_monto > 0) {
      const tipoTexto = p.descuento_tipo === 'porcentaje' ? `${p.descuento_valor}%` : `$${Number(p.descuento_valor).toFixed(2)}`;
      descuentoHtml = `<p>🎁 Descuento: -$${Number(p.descuento_monto).toFixed(2)} (${tipoTexto})</p>`;
    }

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
          ${descuentoHtml}
          <p>🚚 Repartidor: ${getRepartidorTextoPedido(p)}</p>
          <div class="pedido-items">
            <strong>Productos:</strong>
            <ul>${itemsHtml}</ul>
          </div>
        </div>
        <div class="pedido-actions">
          <select onchange="cambiarEstado(${p.id}, this.value)">
            <option ${p.estado === "Recibido" ? "selected" : ""}>Recibido</option>
            <option ${p.estado === "En proceso" ? "selected" : ""}>En proceso</option>
            <option ${p.estado === "El repartidor está en camino" ? "selected" : ""}>El repartidor está en camino</option>
            <option ${p.estado === "Entregado" ? "selected" : ""}>Entregado</option>
          </select>
          <select onchange="asignarRepartidor(${p.id}, this.value)">
            <option value="">Asignar repartidor</option>
            ${repartidoresOptions}
          </select>
          <a href="${mapa}" target="_blank" class="map-btn">Mapa</a>
          <button class="delete-pedido-btn" onclick="eliminarPedido(${p.id})">🗑️ Eliminar</button>
          <button class="edit-pedido-btn" onclick="abrirModalEditarPedido(${p.id})">✏️ Editar productos</button>
          <button class="whatsapp-btn" onclick="abrirModalWhatsApp(${p.id})">📱 WhatsApp</button>
        </div>
      </div>
    `;
  }).join("");
}

async function eliminarPedido(id) {
  if (!confirm("¿Estás seguro de eliminar este pedido? Esta acción no se puede deshacer.")) return;
  const { error } = await supabaseClient.from("pedidos").delete().eq("id", id);
  if (error) {
    handleError(error, "No se pudo eliminar el pedido.");
    return;
  }
  showToast("Pedido eliminado correctamente", "success");
  cargarPedidos();
}

async function cambiarEstado(id, nuevoEstado) {
  const { error } = await supabaseClient.from("pedidos").update({ estado: nuevoEstado }).eq("id", id);
  if (error) {
    handleError(error, "Error actualizando estado.");
    return;
  }
  showToast("Estado actualizado correctamente", "success");
  cargarPedidos();
}

async function asignarRepartidor(id, repartidorId) {
  const repartidor = repartidoresCache.find(r => r.user_id === repartidorId);
  const payload = {
    repartidor_id: repartidorId || null,
    repartidor_nombre: repartidor ? (repartidor.full_name || "") : ""
  };
  const { error } = await supabaseClient.from("pedidos").update(payload).eq("id", id);
  if (error) {
    handleError(error, "No se pudo asignar el repartidor.");
    return;
  }
  showToast("Repartidor asignado correctamente", "success");
  cargarPedidos();
}

function actualizarStats(todos) {
  // Función reservada para futuros usos (no elimina funcionalidad)
}

function renderGrafica(lista) {
  const estados = {
    "Recibido": 0,
    "En proceso": 0,
    "El repartidor está en camino": 0,
    "Entregado": 0
  };
  lista.forEach(p => {
    if (estados[p.estado] !== undefined) estados[p.estado]++;
  });
  const canvas = document.getElementById("graficaPedidos");
  if (!canvas) return;
  if (chart) chart.destroy();
  chart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: Object.keys(estados),
      datasets: [{ data: Object.values(estados) }]
    }
  });
}

// ======================
// RESUMEN DE REPARTIDORES (solo efectivo entregado)
// ======================
function renderRepartidores(lista) {
  const cont = document.getElementById("resumenRepartidores");
  if (!cont) return;

  // Filtrar pedidos en efectivo y entregados
  const pedidosFiltrados = lista.filter(p => 
    p.metodo_pago === "Efectivo" && p.estado === "Entregado"
  );

  if (pedidosFiltrados.length === 0) {
    cont.innerHTML = `<div class="panel">No hay pedidos en efectivo entregados en esta vista.</div>`;
    return;
  }

  // Agrupar por repartidor
  const resumen = {};
  pedidosFiltrados.forEach(p => {
    let repartidorNombre = p.repartidor_nombre;
    if (!repartidorNombre && p.repartidor_id) {
      const rep = repartidoresCache.find(r => r.user_id === p.repartidor_id);
      repartidorNombre = rep ? rep.full_name : "Sin nombre";
    }
    if (!repartidorNombre || repartidorNombre === "Sin asignar") return;

    if (!resumen[repartidorNombre]) resumen[repartidorNombre] = 0;
    resumen[repartidorNombre] += Number(p.total);
  });

  const entradas = Object.entries(resumen);
  if (!entradas.length) {
    cont.innerHTML = `<div class="panel">No hay repartidores con pedidos en efectivo entregados.</div>`;
    return;
  }

  cont.innerHTML = entradas.map(([nombre, total]) => `
    <div class="admin-item">
      <strong>${nombre}</strong>
      <div style="font-size: 1.2rem; font-weight: bold; color: #0ea5a4;">$${total.toFixed(2)}</div>
    </div>
  `).join("");
}

function ponerHoy() {
  const filtro = document.getElementById("filtroFecha");
  if (filtro) filtro.value = getHoy();
  cargarPedidos();
}

function cerrarDia() {
  const fecha = document.getElementById("filtroFecha")?.value || getHoy();
  localStorage.setItem("fishmar_dia_cerrado", fecha);
  showToast(`Día cerrado: ${fecha}`, "success");
}

function logout() {
  supabaseClient.auth.signOut();
  window.location.href = "admin.html";
}

// ======================
// EDICIÓN DE PRODUCTOS EN PEDIDO CON DESCUENTO
// ======================

let pedidoEditando = null;
let productosEditables = [];

function abrirModalEditarPedido(pedidoId) {
  const pedido = pedidosCache.find(p => p.id === pedidoId);
  if (!pedido) {
    showToast("No se encontró el pedido.");
    return;
  }
  pedidoEditando = { ...pedido };
  productosEditables = pedido.items ? pedido.items.map(item => ({ ...item })) : [];

  if (pedido.descuento_valor) {
    descuentoValorActual = pedido.descuento_valor;
    descuentoTipoActual = pedido.descuento_tipo || 'monto';
    document.getElementById("descuentoValor").value = descuentoValorActual;
    document.getElementById("descuentoTipo").value = descuentoTipoActual;
  } else {
    quitarDescuento();
  }

  const select = document.getElementById("nuevoProductoSelect");
  if (select) {
    select.innerHTML = '<option value="">-- Selecciona --</option>';
    productosCache.forEach(prod => {
      const option = document.createElement("option");
      option.value = prod.id;
      option.textContent = `${prod.nombre} - $${prod.precio} / ${prod.tipo_venta === 'granel' ? 'kg' : 'pieza'}`;
      option.dataset.precio = prod.precio;
      option.dataset.tipo_venta = prod.tipo_venta;
      option.dataset.nombre = prod.nombre;
      select.appendChild(option);
    });
    select.addEventListener("change", function() {
      const container = document.getElementById("nuevoProductoCantidadContainer");
      if (this.value) {
        container.style.display = "block";
      } else {
        container.style.display = "none";
      }
    });
  }

  document.getElementById("modalPedidoNumero").textContent = pedido.numero_pedido || `#${pedido.id}`;
  renderizarProductosEditables();
  actualizarInfoDescuento();
  document.getElementById("modalEditarPedido").style.display = "block";
  document.body.style.overflow = "hidden";
}

function renderizarProductosEditables() {
  const cont = document.getElementById("editarProductosLista");
  if (!cont) return;

  if (!productosEditables.length) {
    cont.innerHTML = "<div class='empty-cart'>No hay productos en este pedido.</div>";
    return;
  }

  cont.innerHTML = productosEditables.map((item, index) => {
    const unidad = item.tipo_venta === 'granel' ? 'kg' : 'pieza';
    const step = item.tipo_venta === 'granel' ? 0.01 : 1;
    return `
      <div class="cart-item editable-item" data-index="${index}">
        <div class="cart-item-info">
          <strong>${item.nombre}</strong>
          <small>$${Number(item.precio).toFixed(2)} / ${unidad}</small>
          <div class="cart-item-price">$${(Number(item.precio) * Number(item.qty)).toFixed(2)}</div>
        </div>
        <div class="qty-controls">
          <button onclick="cambiarCantidadProductoEditable(${index}, -${step})">−</button>
          <input type="number" value="${item.qty}" step="${step}" min="0.01" onchange="cambiarCantidadProductoEditable(${index}, 0, this.value)">
          <button onclick="cambiarCantidadProductoEditable(${index}, ${step})">+</button>
          <button class="remove" onclick="eliminarProductoEditable(${index})">Eliminar</button>
        </div>
      </div>
    `;
  }).join("");
}

function cambiarCantidadProductoEditable(index, delta, newValue = null) {
  let item = productosEditables[index];
  if (!item) return;
  let nuevaCantidad;
  if (newValue !== null) {
    nuevaCantidad = parseFloat(newValue);
  } else {
    nuevaCantidad = item.qty + delta;
  }
  if (isNaN(nuevaCantidad)) nuevaCantidad = 0.01;
  if (nuevaCantidad <= 0) {
    productosEditables.splice(index, 1);
  } else {
    if (item.tipo_venta === 'granel') {
      nuevaCantidad = Math.round(nuevaCantidad * 100) / 100;
    } else {
      nuevaCantidad = Math.round(nuevaCantidad);
    }
    item.qty = nuevaCantidad;
  }
  renderizarProductosEditables();
  actualizarInfoDescuento();
}

function eliminarProductoEditable(index) {
  productosEditables.splice(index, 1);
  renderizarProductosEditables();
  actualizarInfoDescuento();
}

function agregarProductoAPedido() {
  const select = document.getElementById("nuevoProductoSelect");
  const cantidadInput = document.getElementById("nuevoProductoCantidad");
  if (!select.value) {
    showToast("Selecciona un producto.");
    return;
  }
  let cantidad = parseFloat(cantidadInput.value);
  if (isNaN(cantidad) || cantidad <= 0) {
    showToast("Ingresa una cantidad válida.");
    return;
  }

  const option = select.options[select.selectedIndex];
  const productoId = parseInt(select.value);
  const nombre = option.dataset.nombre;
  const precio = parseFloat(option.dataset.precio);
  const tipoVenta = option.dataset.tipo_venta;

  const existente = productosEditables.find(p => p.id === productoId);
  if (existente) {
    existente.qty += cantidad;
    if (existente.tipo_venta === 'granel') {
      existente.qty = Math.round(existente.qty * 100) / 100;
    } else {
      existente.qty = Math.round(existente.qty);
    }
  } else {
    productosEditables.push({
      id: productoId,
      nombre: nombre,
      precio: precio,
      tipo_venta: tipoVenta,
      qty: cantidad
    });
  }

  select.value = "";
  cantidadInput.value = "";
  document.getElementById("nuevoProductoCantidadContainer").style.display = "none";

  renderizarProductosEditables();
  actualizarInfoDescuento();
}

function actualizarInfoDescuento() {
  let subtotal = 0;
  productosEditables.forEach(item => {
    subtotal += Number(item.precio) * Number(item.qty);
  });

  let descuento = 0;
  if (descuentoValorActual > 0) {
    if (descuentoTipoActual === 'porcentaje') {
      descuento = subtotal * (descuentoValorActual / 100);
    } else {
      descuento = descuentoValorActual;
    }
    if (descuento > subtotal) descuento = subtotal;
  }
  descuentoMontoActual = descuento;
  const totalConDescuento = roundUpToHalf(subtotal - descuento);

  document.getElementById("subtotalSinDescuento").textContent = subtotal.toFixed(2);
  document.getElementById("montoDescuento").textContent = descuento.toFixed(2);
  document.getElementById("totalConDescuento").textContent = totalConDescuento.toFixed(2);
  document.getElementById("modalEditarTotal").textContent = totalConDescuento.toFixed(2);
}

function aplicarDescuento() {
  const valor = parseFloat(document.getElementById("descuentoValor").value);
  const tipo = document.getElementById("descuentoTipo").value;
  if (isNaN(valor) || valor <= 0) {
    showToast("Ingresa un valor válido para el descuento.");
    return;
  }
  descuentoValorActual = valor;
  descuentoTipoActual = tipo;
  actualizarInfoDescuento();
}

function quitarDescuento() {
  descuentoValorActual = 0;
  descuentoTipoActual = 'monto';
  document.getElementById("descuentoValor").value = "";
  actualizarInfoDescuento();
}

async function guardarEdicionPedido() {
  if (!pedidoEditando) return;

  let subtotal = 0;
  productosEditables.forEach(item => {
    subtotal += Number(item.precio) * Number(item.qty);
  });
  let descuento = 0;
  if (descuentoValorActual > 0) {
    if (descuentoTipoActual === 'porcentaje') {
      descuento = subtotal * (descuentoValorActual / 100);
    } else {
      descuento = descuentoValorActual;
    }
    if (descuento > subtotal) descuento = subtotal;
  }
  const total = roundUpToHalf(subtotal - descuento);

  const payload = {
    items: productosEditables,
    total: total,
    descuento_valor: descuentoValorActual,
    descuento_tipo: descuentoTipoActual,
    descuento_monto: descuento
  };

  const { error } = await supabaseClient
    .from("pedidos")
    .update(payload)
    .eq("id", pedidoEditando.id);

  if (error) {
    handleError(error, "No se pudo guardar los cambios.");
    return;
  }

  showToast("Pedido actualizado correctamente", "success");
  cerrarModalEditarPedido();
  cargarPedidos();
}

function cerrarModalEditarPedido() {
  document.getElementById("modalEditarPedido").style.display = "none";
  document.body.style.overflow = "auto";
  pedidoEditando = null;
  productosEditables = [];
  descuentoValorActual = 0;
  descuentoTipoActual = 'monto';
  descuentoMontoActual = 0;
}

// ======================
// WHATSAPP
// ======================

let pedidoWhatsApp = null;

function abrirModalWhatsApp(pedidoId) {
  const pedido = pedidosCache.find(p => p.id === pedidoId);
  if (!pedido) {
    showToast("No se encontró el pedido.");
    return;
  }
  pedidoWhatsApp = pedido;

  const infoDiv = document.getElementById("whatsappPedidoInfo");
  infoDiv.innerHTML = `
    <strong>Cliente:</strong> ${pedido.nombre}<br>
    <strong>Pedido:</strong> ${pedido.numero_pedido || '#' + pedido.id}<br>
    <strong>Total:</strong> $${Number(pedido.total).toFixed(2)}<br>
    <strong>Estado:</strong> ${pedido.estado}
  `;

  const numeroRaw = pedido.telefono;
  let numeroLimpio = numeroRaw.replace(/\D/g, '');
  if (numeroLimpio.length === 10) {
    numeroLimpio = '52' + numeroLimpio;
  }
  document.getElementById("whatsappNumero").value = `+${numeroLimpio}`;

  let mensaje = `Hola ${pedido.nombre}, soy de FishMar. Te contactamos para informarte sobre tu pedido:\n\n`;
  mensaje += `📦 *Pedido #${pedido.numero_pedido || pedido.id}*\n`;
  if (pedido.items && pedido.items.length) {
    mensaje += `🛒 *Productos:*\n`;
    pedido.items.forEach(item => {
      const unidad = item.tipo_venta === 'granel' ? 'kg' : 'pz';
      mensaje += `• ${item.nombre} x${item.qty} ${unidad} - $${(Number(item.precio) * Number(item.qty)).toFixed(2)}\n`;
    });
  }
  mensaje += `\n💰 *Total:* $${Number(pedido.total).toFixed(2)}\n`;
  mensaje += `🚚 *Estado:* ${pedido.estado}\n\n`;
  mensaje += `Por favor, confírmame que has recibido esta información. ¡Gracias!`;
  document.getElementById("whatsappMensaje").value = mensaje;

  document.getElementById("modalWhatsApp").style.display = "block";
  document.body.style.overflow = "hidden";
}

function cerrarModalWhatsApp() {
  document.getElementById("modalWhatsApp").style.display = "none";
  document.body.style.overflow = "auto";
  pedidoWhatsApp = null;
}

function enviarWhatsApp() {
  const numero = document.getElementById("whatsappNumero").value.trim();
  const mensaje = document.getElementById("whatsappMensaje").value.trim();
  if (!numero) {
    showToast("No hay número de teléfono válido.");
    return;
  }
  if (!mensaje) {
    showToast("Escribe un mensaje.");
    return;
  }
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, "_blank");
  cerrarModalWhatsApp();
}

// ======================
// MÉTRICAS AVANZADAS
// ======================

function cambiarPeriodo() {
  periodoActual = document.getElementById("periodoSelector").value;
  const divFechas = document.getElementById("fechasPersonalizadas");
  if (periodoActual === 'personalizado') {
    divFechas.style.display = "flex";
  } else {
    divFechas.style.display = "none";
    actualizarMetricasPeriodo();
  }
}

function aplicarPersonalizado() {
  fechaInicioPersonalizado = document.getElementById("fechaInicio").value;
  fechaFinPersonalizado = document.getElementById("fechaFin").value;
  if (!fechaInicioPersonalizado || !fechaFinPersonalizado) {
    showToast("Selecciona ambas fechas");
    return;
  }
  actualizarMetricasPeriodo();
}

async function actualizarMetricasPeriodo() {
  let fechaInicio, fechaFin;
  const hoy = new Date();
  hoy.setHours(0,0,0,0);

  switch (periodoActual) {
    case 'hoy':
      fechaInicio = hoy;
      fechaFin = hoy;
      break;
    case 'semana':
      const inicioSemana = new Date(hoy);
      inicioSemana.setDate(hoy.getDate() - hoy.getDay());
      fechaInicio = inicioSemana;
      fechaFin = hoy;
      break;
    case 'mes':
      fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      fechaFin = hoy;
      break;
    case 'personalizado':
      fechaInicio = new Date(fechaInicioPersonalizado);
      fechaFin = new Date(fechaFinPersonalizado);
      break;
  }

  const pedidosFiltrados = pedidosCache.filter(p => {
    const fechaPedido = getFechaPedido(p);
    if (!fechaPedido) return false;
    return fechaPedido >= fechaInicio && fechaPedido <= fechaFin;
  });

  actualizarStatsFiltrados(pedidosFiltrados);
  generarDatosIngresosDiarios(pedidosFiltrados, fechaInicio, fechaFin);
  generarVentasPorDiaSemana(pedidosFiltrados);
}

function actualizarStatsFiltrados(pedidos) {
  const ingresos = pedidos.reduce((acc, p) => acc + Number(p.total), 0);
  const enProceso = pedidos.filter(p => p.estado === "En proceso").length;
  const entregados = pedidos.filter(p => p.estado === "Entregado").length;
  document.getElementById("statPedidos").textContent = pedidos.length;
  document.getElementById("statIngresos").textContent = `$${ingresos.toFixed(2)}`;
  document.getElementById("statProceso").textContent = enProceso;
  document.getElementById("statEntregados").textContent = entregados;
}

function generarDatosIngresosDiarios(pedidos, fechaInicio, fechaFin) {
  const diffDays = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24)) + 1;
  const daysToShow = Math.min(diffDays, 14);
  const labels = [];
  const ingresosPorDia = [];

  for (let i = 0; i < daysToShow; i++) {
    const fecha = new Date(fechaInicio);
    fecha.setDate(fechaInicio.getDate() + i);
    const fechaStr = fecha.toISOString().split('T')[0];
    labels.push(fechaStr);
    const totalDia = pedidos
      .filter(p => getFechaPedidoFiltro(p) === fechaStr)
      .reduce((sum, p) => sum + Number(p.total), 0);
    ingresosPorDia.push(totalDia);
  }

  const ctx = document.getElementById("graficaIngresosDiarios").getContext("2d");
  if (chartIngresos) chartIngresos.destroy();
  chartIngresos = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Ingresos ($)',
        data: ingresosPorDia,
        borderColor: '#0ea5a4',
        backgroundColor: 'rgba(14,165,164,0.1)',
        tension: 0.2,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        tooltip: { callbacks: { label: (ctx) => `$${ctx.raw.toFixed(2)}` } }
      }
    }
  });
}

function generarVentasPorDiaSemana(pedidos) {
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const ventasPorDia = [0,0,0,0,0,0,0];

  pedidos.forEach(p => {
    const fechaPedido = getFechaPedido(p);
    if (fechaPedido) {
      const dia = fechaPedido.getDay();
      ventasPorDia[dia] += Number(p.total);
    }
  });

  const ctx = document.getElementById("graficaVentasPorDia").getContext("2d");
  if (chartVentasDia) chartVentasDia.destroy();
  chartVentasDia = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dias,
      datasets: [{
        label: 'Ventas ($)',
        data: ventasPorDia,
        backgroundColor: '#0ea5a4',
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        tooltip: { callbacks: { label: (ctx) => `$${ctx.raw.toFixed(2)}` } }
      }
    }
  });
}

// ======================
// GESTIÓN DE USUARIOS (SUPER ADMIN)
// ======================

async function cargarListaUsuarios() {
  if (!esSuperAdmin) return;
  const { data, error } = await supabaseClient
    .from("user_roles")
    .select("user_id, full_name, role, is_superadmin")
    .order("full_name", { ascending: true });
  if (error) {
    handleError(error, "Error cargando lista de usuarios.");
    return;
  }
  listaUsuarios = data || [];
  renderListaUsuarios();
}

function renderListaUsuarios() {
  const cont = document.getElementById("listaUsuarios");
  if (!cont) return;
  if (!listaUsuarios.length) {
    cont.innerHTML = '<div class="panel">No hay usuarios registrados.</div>';
    return;
  }
  cont.innerHTML = listaUsuarios.map(user => `
    <div class="admin-item">
      <div>
        <strong>${user.full_name || "Sin nombre"}</strong>
        <p>${user.user_id}</p>
        <p>Rol: ${user.role} ${user.is_superadmin ? " (Super Admin)" : ""}</p>
      </div>
      <div class="admin-actions">
        <button class="delete-btn" onclick="eliminarUsuario('${user.user_id}')">Eliminar</button>
      </div>
    </div>
  `).join("");
}

async function eliminarUsuario(userId) {
  if (!confirm("¿Eliminar este usuario? Perderá acceso al sistema.")) return;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      showToast("Tu sesión ha expirado. Por favor, inicia sesión nuevamente.");
      window.location.href = "admin.html";
      return;
    }

    const { error } = await supabaseClient.functions.invoke('manage-user', {
      body: { action: 'delete', userId }
    });

    if (error) {
      if (error.message.includes('401') || error.status === 401) {
        const { data: refreshData, error: refreshError } = await supabaseClient.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          showToast("Tu sesión ha expirado. Por favor, inicia sesión nuevamente.");
          window.location.href = "admin.html";
          return;
        }
        const { error: retryError } = await supabaseClient.functions.invoke('manage-user', {
          body: { action: 'delete', userId }
        });
        if (retryError) {
          handleError(retryError, "Error al eliminar usuario.");
        } else {
          showToast("Usuario eliminado correctamente", "success");
          cargarListaUsuarios();
        }
      } else {
        handleError(error, "Error al eliminar usuario.");
      }
      return;
    }

    showToast("Usuario eliminado correctamente", "success");
    cargarListaUsuarios();
  } catch (err) {
    handleError(err, "Error de conexión.");
  }
}

function mostrarModalCrearUsuario() {
  document.getElementById("modalCrearUsuario").style.display = "block";
  document.body.style.overflow = "hidden";
}

async function crearUsuario() {
  const email = document.getElementById("nuevoEmail").value.trim();
  const role = document.getElementById("nuevoRol").value;
  const fullName = document.getElementById("nuevoNombre").value.trim();
  const password = document.getElementById("nuevoPassword").value.trim();

  if (!email || !role || !fullName) {
    showToast("Completa todos los campos obligatorios.");
    return;
  }

  const payload = {
    action: 'create',
    email,
    role,
    fullName
  };
  if (password) {
    payload.password = password;
  }

  try {
    const { data, error } = await supabaseClient.functions.invoke('manage-user', {
      body: payload
    });

    if (error) {
      handleError(error, "Error al crear usuario.");
      return;
    }
    if (data && data.error) {
      showToast(data.error);
      return;
    }

    showToast(password
      ? "Usuario creado con contraseña. Puede iniciar sesión ahora."
      : "Usuario creado. Se envió un correo para establecer contraseña.", "success");
    cerrarModalCrearUsuario();
    cargarListaUsuarios();
  } catch (err) {
    handleError(err, "Error de conexión.");
  }
}

function cerrarModalCrearUsuario() {
  const modal = document.getElementById("modalCrearUsuario");
  if (modal) {
    modal.style.display = "none";
    document.body.style.overflow = "auto";
    document.getElementById("nuevoEmail").value = "";
    document.getElementById("nuevoRol").value = "admin";
    document.getElementById("nuevoNombre").value = "";
    document.getElementById("nuevoPassword").value = "";
  }
}

// ======================
// CONFIGURACIÓN DE PESTAÑAS
// ======================

function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const panes = document.querySelectorAll('.tab-pane');
  
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      panes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === `tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`) {
          pane.classList.add('active');
        }
      });
      if (tabId === 'metricas' && chart) {
        chart.update();
      }
    });
  });
}

// ======================
// AUTOACTUALIZACIÓN
// ======================

setInterval(() => {
  cargarPedidos();
}, 5000);

// ======================
// INICIALIZACIÓN
// ======================

(async function initDashboard() {
  const autenticado = await verificarSesionAdmin();
  if (!autenticado) return;
  await cargarRepartidores();
  await cargarPedidos();
  await cargarProductosAdmin();
  setupTabs();
  actualizarMetricasPeriodo();
  if (esSuperAdmin) {
    document.getElementById("tabUsuariosBtn").style.display = "inline-block";
    await cargarListaUsuarios();
  }
})();

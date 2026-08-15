import { useEffect, useRef } from 'react'

// El botón "atrás" del teléfono debe CERRAR la capa abierta (detalle del pedido,
// historial, formulario de dirección…), no sacar al cliente de la app. Sin esto,
// quien entra desde WhatsApp y le da atrás vuelve al chat y siente que "perdió"
// el pedido — que es justo lo que reportan los clientes.
//
// Cómo funciona: mientras haya capas abiertas se mantiene UNA entrada de guardia
// en el historial (misma URL, no se ve nada). El "atrás" se la lleva y dispara
// popstate, que cierra la capa de arriba; si quedan capas debajo, se vuelve a
// poner la guardia.
//
// A propósito NO se llama history.back() al cerrar con la X: esa llamada es
// asíncrona y se cruzaba con el doble montaje de StrictMode, dejando la capa sin
// guardia (y el "atrás" volvía a sacar de la app). El precio de no hacerlo es
// que, tras cerrar una capa a mano, el primer "atrás" solo consume la guardia
// sobrante; el segundo ya sale. Se prefiere eso a perder el pedido.

const stack = []          // capas abiertas, la última es la de arriba
let listening = false

function ensureGuard() {
  if (window.history.state?.dsGuard) return   // ya hay guardia puesta
  window.history.pushState({ dsGuard: true }, '')
}

function onPop() {
  const top = stack.pop()
  if (!top) return                 // nada abierto: es un "atrás" de verdad
  top.close()
  if (stack.length) ensureGuard()  // quedan capas debajo: se vuelve a proteger
}

export default function useBackClose(open, onClose) {
  const cb = useRef(onClose)
  cb.current = onClose

  useEffect(() => {
    if (!open) return
    if (!listening) { window.addEventListener('popstate', onPop); listening = true }

    const entry = { close: () => cb.current?.() }
    stack.push(entry)
    ensureGuard()

    return () => {
      const i = stack.indexOf(entry)
      if (i !== -1) stack.splice(i, 1)
    }
  }, [open])
}

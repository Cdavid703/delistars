import { Link } from 'react-router-dom'

const NotFound = () => {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-7xl font-display font-bold text-primary mb-4">404</div>
        <p className="text-2xl font-display font-semibold text-coal mb-2">Página no encontrada</p>
        <p className="text-muted-fg mb-8">La página que buscas no existe o ha sido movida</p>
        <Link
          to="/"
          className="inline-block bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-lg font-medium transition-colors shadow-soft"
        >
          Volver al Dashboard
        </Link>
      </div>
    </div>
  )
}

export default NotFound

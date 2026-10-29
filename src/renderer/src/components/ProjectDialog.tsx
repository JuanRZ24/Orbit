import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import { PROJECT_COLORS, type Project } from '../../../shared/types'
import { cn } from '../lib/ui'
import { Labeled, Modal } from './ui'

export function ProjectDialog({ open, project, onClose }: {
  open: boolean
  project?: Project | null
  onClose: () => void
}): ReactNode {
  const { run, selectProject, setView } = useStore()
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0])

  useEffect(() => {
    if (!open) return
    setName(project?.name ?? '')
    setPrefix(project?.prefix ?? '')
    setDescription(project?.description ?? '')
    setColor(project?.color ?? PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)])
  }, [open, project])

  const submit = (): void => {
    const clean = name.trim()
    if (!clean) return
    onClose()
    if (project) {
      void run(() => api.updateProject(project.id, { name: clean, prefix: prefix.trim().toUpperCase() || undefined, description, color }), 'Proyecto actualizado')
    } else {
      void run(async () => {
        const created = await api.createProject({ name: clean, prefix: prefix.trim() || undefined, description, color })
        await selectProject(created.id)
        setView('backlog')
      }, 'Proyecto creado')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? 'Editar proyecto' : 'Nuevo proyecto'}
      subtitle={project ? undefined : 'Cada proyecto trae su propio backlog, tablero, incidencias y wiki.'}
      width="max-w-lg"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit} disabled={!name.trim()}>
            {project ? 'Guardar' : 'Crear proyecto'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Labeled label="Nombre">
          <input autoFocus className="field" value={name} placeholder="Mi próxima idea"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
        </Labeled>

        <Labeled label="Prefijo de referencia" hint="Se usa para numerar: ORB-1, ORB-2… Si lo dejas vacío se genera solo.">
          <input className="field font-mono uppercase" maxLength={5} value={prefix}
            placeholder="auto" onChange={(e) => setPrefix(e.target.value.toUpperCase())} />
        </Labeled>

        <Labeled label="Descripción">
          <textarea className="field min-h-20 resize-y" value={description}
            placeholder="Para qué es este proyecto" onChange={(e) => setDescription(e.target.value)} />
        </Labeled>

        <Labeled label="Color">
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className={cn('h-7 w-7 rounded-lg border-2 transition-transform',
                  color === c ? 'scale-110 border-ink' : 'border-transparent hover:scale-105')}
                style={{ background: c }} aria-label={`Color ${c}`} />
            ))}
          </div>
        </Labeled>
      </div>
    </Modal>
  )
}

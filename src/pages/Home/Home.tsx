import AppSidebar from '@/components/dashboard/Sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import SiteHeader from '@/components/SiteHeader'
import CreateEncounter from '../EncounterForm/CreateEncounter'
import Dashboard from './Dashboard'
import { Websockets } from '../Websockets/Websockets'

function Home() {
  return (
    <>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 56)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset className="flex flex-col h-screen overflow-hidden">
          <SiteHeader />
          {/* <CreateEncounter /> */}
          {/* <Dashboard /> */}
          <Websockets />
         

        </SidebarInset >
      </SidebarProvider>
    </>
  )
}

export default Home
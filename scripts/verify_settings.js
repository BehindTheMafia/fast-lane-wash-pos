
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dwbfmphghmquxigmczcc.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3YmZtcGhnaG1xdXhpZ21jemNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NDMzMzIsImV4cCI6MjA4NjQxOTMzMn0.KvBS_ZGY-2JzO9q3AOV5Mb-4S7Bk8rMLZJokRiU5Q3U'
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSettings() {
    console.log('--- VERIFICANDO CONFIGURACIÓN DE DOBLE TICKET ---')
    const { data, error } = await supabase
        .from('business_settings')
        .select('business_name, double_print_ticket')

    if (error) {
        console.error('Error al consultar:', error.message)
        return
    }

    if (!data || data.length === 0) {
        console.log('No se encontraron registros en business_settings.')
        return
    }

    data.forEach((row, index) => {
        console.log(`Registro ${index + 1}:`)
        console.log('  Negocio:', row.business_name)
        console.log('  Doble Ticket Activado:', row.double_print_ticket ? 'SÍ (Correcto)' : 'NO')
    })
    console.log('-----------------------------------------------')
}

checkSettings()

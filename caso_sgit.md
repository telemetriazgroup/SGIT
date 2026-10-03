#Se requiere realizar un sistema de gestion  de instalacion de telemetrias  (SGIT) para el area de desarrollo 

se recibe por correo electronico las solicitudes de telemtria -> el correo es de gmail

    Por lo que se requiere conectarse a la API de gamil para ahcer seccion en el correo y traer todo los correos segun las fechas que se decida , y mantener actualizado la sincroniacion cada 5 minutos  para bajar los ultimos correos

    luego una vez que tengamos el correo con un lagica de algoritmo taremos todo esos datos y buscamos los correos en los cuales estamos involucrados para la instalacion de telemetria

    importante al importar los correos los traemos con todo imegens y archivos , tratamos de tener una replica de gamil en nuestra sistema .

    este es un ejemplo del asunto que llega por correo:

    ASIGNAR Y DESPACHAR // COT 10020263623 // TICKET DE VENTAS #2139 // ALQUILER DE CONTENEDOR REEFER 40 RH + SERVICIO DE TRANSPORTE Y MANIPULEO - MAKRO HUACHO - MAKRO SUPERMAYORISTA S.A.

    ejemplo del cuerpo que llega :

-----------------------------------
Buenas tardes

Estimado equipo

DESPACHO


Estimado Johan por favor asignar y despachar en condición de alquiler:

Tener en cuenta que el contenedor no debe presentar malos olores, ni oxido.


01 contenedor Reefer 40rh Maquina Reefer Última Tecnologia (Magnum Plus Mp4000 Thermoking) o (Starcool)
 

incluye:


Luminarias
Cortinas de Vinil
Alarmas de seguridad
 

FECHA Y HORA DE ENTREGA – CLIENTE:

 
Fecha: 12/09/2026
Hora: 10 AM
 

SSOMA


Estimado Jose / Brayer

 
Por favor su apoyo enviando la documentación solicitada por el cliente.

 

ZTRACK


Estimada Eusebio / Luis, por favor asignar la telemetría asimismo hacerme llegar el usuario y contraseña del acceso a la plataforma cuando este instalado el equipo


1 und de telemetría
 

ALMACEN

Por favor despachar en condición de alquiler, lo siguiente:

01 Und Transformador 220v-380v-440v
10 metros de cable vulcanizado
Kit De Instalación
01 ENCHUFE 32AMP 3P+T 440V ROJO 3H IP67  
 

ÁREA TECNICA


Estimada Angie / Mario / Jenny, por favor su apoyo con la asignación de 01 técnico para la instalación del equipo.

Una vez instalado el equipo por favor hacerme llegar la siguiente documentación:


El report firmado y sellado nombre completo y dni del personal encargado de tienda.
Evidencia de que los equipos están quedando totalmente operativos con la temperatura correspondiente (adjuntar fotos)
Guía firmada.
Acta de conformidad debidamente firmada y sellada por el personal de encargado del servicio y de tienda,
 
Datos:

Temperatura:  -21°C
Producto almacenar: congelados
TICKET DE VENTAS #2139
 

TRANSPORTE


Estimada Estefani / Yennifer , por favor asignar unidad y operador para el traslado y la descarga del contenedor.

FECHA Y HORA DE ENTREGA – CLIENTE:


Fecha: 12/09/2026
Hora: 10 AM
Dirección: Ave San Martin 580, Huacho 15138 https://maps.app.goo.gl/JUPbNn35GtDB2ENQ6
 

SANDRA / GERMAN


Tener en consideración la siguiente atención para cualquier asistencia técnica.

 
Saludos cordiales.

 
Olinda Lopez

Asistente comercial


comercial4@zgroup.com.pe

+51 981 322 944

www.zgroup.com.pe


-------------------


en el cuerpo podemos buscar  palabras como "Eusebio" , "Luis" ,"Telemetria" , "usuario y contraseña del acceso a la plataforma"  , y asi una lista de palabras que harian que este correo se marque como un evento que involucra al area de desarrollo .

Entonces el sistema capta la informacion del correo y crea un ingreso de evento a atender :

en el asunto tenemos informacion importante :

COT 10020263623 -> que es la cotizacion de la operacion  , informacion que esta ligado a odoo , del cual podemos obtener informacion en el modulo de venta para ver el estado y como evoluciona

TICKET DE VENTAS #2139  -> que en odoo puede obtenerse informacion del modulo servicio externo como ticket o tarea

ALQUILER DE CONTENEDOR REEFER 40 RH + SERVICIO DE TRANSPORTE Y MANIPULEO - MAKRO HUACHO - MAKRO SUPERMAYORISTA S.A.

-> AQUI TENEMOS EL ASUNTO DE LA COTIZACION -> LUGAR -> CLIENTE

    en el asunto ya tenemos informacion importante :

    BUscamos la informacion d ela cantidad de contenedores importante : 

    01 contenedor Reefer 40rh Maquina Reefer Última Tecnologia (Magnum Plus Mp4000 Thermoking) o (Starcool)


    Buscamos la hora y fecha de entrega al cliente , que esta en la seccion : 

    FECHA Y HORA DE ENTREGA – CLIENTE:

    
        Fecha: 12/09/2026
        Hora: 10 AM
        Dirección: Ave San Martin 580, Huacho 15138 https://maps.app.goo.gl/JUPbNn35GtDB2ENQ6

    datos del funcionamiento si hay como en este caso : 

        Temperatura:  -21°C
        Producto almacenar: congelados

    buscamos la parte de ztrack , que es la parte crucial que nos convoca y que marca el correo como una actividad para nosotros

        ZTRACK


            Estimada Eusebio / Luis, por favor asignar la telemetría asimismo hacerme llegar el usuario y contraseña del acceso a la plataforma cuando este instalado el equipo


            1 und de telemetría

    BUscamos los datos del comercial que esta haciendo la solicitud  , en este caso 

        Olinda Lopez

        Asistente comercial


        comercial4@zgroup.com.pe

        +51 981 322 944


-----------------------

con esta logica obtenemos la mayor parte de la informacion posible del correo para con esa informacion crear la tarea pendiente que se registra en nuestro sistema , ahora es muy importante , los correos llegan y se anidad como una linea de correo , no debemos crean un duplicado de la tarea si es la misma cotizacion , si crear una situacion de la linea de correo para enterarnos como avanzan las demas areas , ya que en la linea de correo las distintas areas reportan el avance o se hacen reprogramaciones o se reportan incidentes .

ahora tenemso en sistema un bot de wattsapp usa un cliente alterantivo que emula wattsap whatsapp-web.js ^1.34  . tendremos un sistema que al detectar la tarea avisara al equipo de desarrollo que esta conformado por 3 o 4 personas .

Luego el bot consultara al area de despacho cual el el codigo y la maquina del equipo asignado y consultara cada hora de 8 a 18:00 , si los pendientes tal se consultaron al equipo de desarrollo y se validaron , entonces el equipo puede tomar uno de las tareas y alimentar informacion y decir "johan responsdable de despachos dice que no hay equipo asigando " ," ANgie del area tecnica dice que la maquina esta en reparacion " y puede añadir eso una imagen de referencia , y todo esto se rergistra en el seguimeinto d ela tarea como estado de atencion , tambien puede seleccionar una tarea y decir en validacion , recuerdame en 4 horas , importante las tareas que ya tiene avances no entran en el recordatorio de cada hora , pero puede registrarse un nuevo incidente , ya que el menu podemos ir a registra incidente y seleccionamos la tarea . la idea es recopilar toda la informacion posible  . 

Luego por wattsapp o por la aplicacion el moembro dle area de desarrollo puede poner en la tarea el boton , atender telemetria y puede crear cuantas MO de fabricvacion en odoo quiuera desde la aplicacion , ejemplo el correo dice 2 telemtrias , entonces puede deicidr crear las 2 atenciones de esa tarea y decidir crear una MO o fabricacion para esa telemtria para solicitar materiales para la instalacion , entonces en una fabricacion normalmente hay un lista de materiales de los cuales debemos consumir de odoo y replicar en nuestro sistema , de tal forma que podamos crear desde nuetsra aplicacion la fabricacion y seleccionar los materiales que se necesita , una vez tengamos los materiales se debe imprimir el docuemnto y firmlarlo , s epide foto de la mo para que quede registro que se solicito y cuando se recibe de almacen tambien se registra la foto y el incidente , puede ser que alamacen demore o diga que no tienestock eso , debe quedar registrado como incidente , uan vez que reciba los materiales debe confirmar en la plaicacion que reicibimos materiale spara esta tarea o en todo caso no fue necesario . y luego pasamos al evento d ela instalcion del dispositivo de telemtria donde se registra la foto de la instalcion la imagen del dispositivo , el contenedor , la maquina , el chip asignado , del equipo . ahora una vez instalado pasamos a la parte de prueba donde segun modelo de maquina a instalr se consulta a la api de conexion y se obtienen los datos de la conexion dejando sentada la correcta instalacion y la toma de datos  , de form apredefinda como siguiente paso nos conectamos a una api de la plataforma que nos genera de forma predefinida un nuevo usuario o contraseña o en todo caso nos permite asignarle a una cuenta que ya existe . despues de eso queda cerrada la tarea con la generacion del susuario y contraseña , las fotos de prueba de la instalcion y un anexo con todo los incidente com liena de tiempo del trabajo realizado . sehaciendo refrencia a johan que ya etsa instalado lA telemtria y el codigo para que lo asigne y despcahe con el equipo , y a el comercila se le envia los accesos a la plataforma y el reporte de instalacion con todo los datos 
    



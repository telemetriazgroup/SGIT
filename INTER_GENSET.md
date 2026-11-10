Orden (el texto de alimentación duplica Dv_Water al final; el último es Dv_rpm, como en la tabla):

Tr_Timer1, Tr_Timer2, Rt_Voltage, Rt_Battery, Rt_Water, Rt_Frequency, Rt_Fuel, Rt_Voltaje2, Rt_Rotor, Rt_Field, Dv_Setting, Dv_Alarm, Dv_Message, Dv_Mode, Dv_Fuel, Dv_Voltage, Dv_Frequency, Dv_Battery, Dv_Water, Dv_rpm

Horómetros (Tr_Timer1, Tr_Timer2) — algoritmo distinto al resto:

Token tipo 37060000.
Si los últimos cuatro dígitos son 0000, recortarlos → 3706.
Invertir por pares → 0637.
Interpretar como hexadecimal → decimal (0x0637 = 1591).
Comprobado con el ejemplo de campo: E3020000 → E302 → 02E3 → 739. 
Resto de campos: hex → int, luego factor:

Campo	Factor	Ejemplo
Rt_Voltage, Rt_Water, Rt_Frequency, Rt_Fuel, Rt_Voltaje2, Rt_Rotor, Rt_Field	÷10	1108 → 436 V
Rt_Battery	÷100	572 → 13,94 V
Dv_Setting, Dv_Alarm, Dv_Message, Dv_Mode, Dv_rpm	×1	25B → 603
Dv_Fuel, Dv_Voltage, Dv_Frequency, Dv_Water	÷10	5EE → 151,8 L
Dv_Battery	÷10	8B → 13,9 V
Un token ausente o ilegible → null + bit 0 de calidad. Trama corta → se decodifica lo que hay.

Centinela Dv_Fuel: FFFF → 6553,5 L. Eso no es combustible. Es “no programado / sensor ausente”. Marcar calidad y no usar en cruzado litros↔galones. Encaja con A-10 (equipos sin sensor de combustible).

Rt_Fuel = 0 con Dv_Fuel = 6553.5 en las muestras de agosto: no disparar FLAG 32 (discrepancia gal/L) si uno de los dos es centinela o cero de sensor.
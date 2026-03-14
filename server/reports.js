import sql from 'mssql';

/**
 * Reports configuration.
 *
 * To add a new report:
 * 1. Add a new entry to this object with a unique key
 * 2. Define params (what the frontend sends as query params)
 * 3. Define buildQuery(params, request) that binds parameters and returns the SQL string
 *
 * The frontend only needs to call: GET /api/reports/<key>?param1=value1&param2=value2
 */
const reports = {
  maquilas: {
    params: ['startDate', 'endDate'],
    buildQuery(params, request) {
      request.input('startDate', sql.DateTime, new Date(params.startDate));
      request.input('endDate', sql.DateTime, new Date(params.endDate));

      const ROUTE_IDS = [
        '9750B27C-F6EA-4E40-A0C7-6A0FFA6DD794',
        '5453EAF0-985A-4110-8C5C-5C2C501264EE',
        '92993E1A-B788-426B-81B5-997415CFD353',
        'BC075FCE-A60B-418E-984A-A75785068BD4',
        'DC5CDFFE-5687-4FD5-B1B2-AA0D73C25784',
        '4555483A-5424-471A-A881-B3B41A81AA98',
        '2750B58F-2861-4BFC-A0CE-B60BBB128BCA',
        '55B899D3-8563-4515-9AD3-CFE93969E993',
        'BB75603D-65F3-4DD0-A639-F13ADA795ACA',
        '9B32E0D8-8C1F-4571-98B9-F4C335095446',
      ];

      const routeParams = ROUTE_IDS.map((id, i) => {
        request.input(`route${i}`, sql.UniqueIdentifier, id);
        return `@route${i}`;
      }).join(',');

      return `
        SELECT SU.Nombre as Sucursal,
               S.[Clave] AS Solicitud,
               ME.Nombre as Medico,
               E.Clave AS ClaveEstudio,
               E.Nombre AS NombreEstudio,
               ES.Nombre as Estatus,
               CR.Nombre as Ruta,
               M.Clave as Maquilador,
               RE.FechaEntrega as FechaEntrega
        FROM [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[Relacion_Solicitud_Estudio] AS RE
        INNER JOIN [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[CAT_Solicitud] AS S
            ON RE.SolicitudId = S.Id
        INNER JOIN [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[CAT_Expedientes] as EX
            ON S.ExpedienteId = EX.Id
        INNER JOIN [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[CAT_Medico] as ME
            ON S.MedicoId = ME.Id
        INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].[Relacion_Ruta_Estudio] AS R
            ON RE.EstudioId = R.EstudioId
        INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].[CAT_Rutas] AS CR
            ON R.RouteId = CR.Id
        INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].CAT_Maquilador as M
            ON CR.MaquiladorId = M.Id
        INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].[CAT_Estudio] AS E
            ON R.EstudioId = E.Id
        INNER JOIN [LAB_RAMOS_PROD_EXPEDIENTE].[dbo].[Estatus_Solicitud_Estudio] AS ES
            ON RE.EstatusId = ES.Id
        INNER JOIN [LAB_RAMOS_PROD_CATALOGO].[dbo].[CAT_Sucursal] AS SU
            ON S.SucursalId = SU.Id
        WHERE S.FechaCreo >= @startDate
          AND S.FechaCreo < @endDate
          AND RE.EstatusId <> 9
          AND R.RouteId IN (${routeParams})
        ORDER BY S.SucursalId, S.Clave
      `;
    },
  },

  // --- ADD NEW REPORTS BELOW ---
  // Example:
  // ventas: {
  //   params: ['startDate', 'endDate', 'sucursalId'],
  //   buildQuery(params, request) {
  //     request.input('startDate', sql.DateTime, new Date(params.startDate));
  //     request.input('endDate', sql.DateTime, new Date(params.endDate));
  //     request.input('sucursalId', sql.UniqueIdentifier, params.sucursalId);
  //     return `SELECT ... FROM ... WHERE ...`;
  //   },
  // },
};

export default reports;
